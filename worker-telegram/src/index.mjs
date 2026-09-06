// Worker d'ingestion : écoute les salons Telegram configurés, parse les
// annonces, télécharge les photos, pousse dans Supabase.
//
//   node src/index.mjs              écoute en continu (temps réel)
//   node src/index.mjs --backfill   rattrape l'historique puis écoute
//
// Un point de conception qui compte : dans Telegram, une annonce avec plusieurs
// photos arrive en plusieurs messages partageant un `groupedId`, et le texte
// n'est que sur l'un d'eux. On ne peut donc pas traiter message par message :
// on bufferise par album et on ne parse qu'après un court silence.

import { createHash } from 'node:crypto'
import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage } from 'telegram/events/index.js'
import { parseListing, dedupeKey } from '../../shared/talents/parse.mjs'
import { readEnv } from './env.mjs'
import { makeStore } from './store.mjs'

const env = readEnv(['TG_API_ID', 'TG_API_HASH', 'TG_SESSION', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ORG_ID'])
const BACKFILL = process.argv.includes('--backfill')
const ALBUM_WAIT_MS = 2500      // silence après lequel un album est considéré complet
const MAX_PHOTOS = 4

const store = makeStore(env)
const client = new TelegramClient(new StringSession(env.TG_SESSION), Number(env.TG_API_ID), env.TG_API_HASH, { connectionRetries: 5 })

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ── Téléchargement des photos ────────────────────────────────────────────────
async function downloadPhotos(messages) {
  const out = []
  for (const m of messages) {
    if (out.length >= MAX_PHOTOS) break
    if (!m.photo) continue
    try {
      const buffer = await client.downloadMedia(m, { thumb: -1 })   // -1 = meilleure qualité
      if (!buffer?.length) continue
      out.push({ buffer, hash: createHash('sha1').update(buffer).digest('hex').slice(0, 16) })
    } catch (e) { log('  photo non téléchargée :', e.message) }
  }
  return out
}

// ── Traitement d'un groupe de messages = une annonce ─────────────────────────
async function handleGroup(salon, messages, prefs) {
  const text = messages.map(m => m.message || m.text || '').find(t => t && t.trim().length > 20)
  if (!text) return 'skipped'

  const parsed = parseListing(text)
  const photos = await downloadPhotos(messages)
  parsed.dedupeKey = dedupeKey(parsed.fields, parsed.raw, photos.map(p => p.hash))

  const first = messages[0]
  const stored = photos.length
    ? await store.uploadPhotos(photos, parsed.dedupeKey.replace(/[^a-z0-9]/gi, ''))
    : []

  const res = await store.saveListing({
    salonId: salon.id,
    salonTitle: salon.title,
    msgId: Number(first.id),
    groupedId: first.groupedId ?? null,
    parsed,
    photos: stored,
    postedAt: new Date((first.date ?? Date.now() / 1000) * 1000).toISOString(),
    prefs,
  })
  const who = parsed.fields.listing_id ? `#${parsed.fields.listing_id}` : (parsed.fields.origin ?? '?')
  log(`  ${res === 'inserted' ? '✓' : '·'} ${res.padEnd(9)} ${who} · ${stored.length} photo(s) · conf ${parsed.confidence.toFixed(2)}`)
  return res
}

// ── Buffer d'albums ──────────────────────────────────────────────────────────
const buffers = new Map()   // clé album → { salon, messages, timer }

function queue(salon, message, prefs) {
  const key = `${salon.id}:${message.groupedId ?? 'm' + message.id}`
  const entry = buffers.get(key) ?? { salon, messages: [], timer: null }
  entry.messages.push(message)
  clearTimeout(entry.timer)
  entry.timer = setTimeout(async () => {
    buffers.delete(key)
    try { await handleGroup(salon, entry.messages.sort((a, b) => a.id - b.id), prefs) }
    catch (e) { log('  erreur :', e.message); await store.salonError(salon.id, e.message) }
  }, ALBUM_WAIT_MS)
  buffers.set(key, entry)
}

// ── Rattrapage de l'historique ───────────────────────────────────────────────
async function backfill(salon, prefs) {
  const limit = Number(env.BACKFILL_LIMIT || 200)
  log(`Backfill « ${salon.title} » (${limit} messages)…`)
  const msgs = await client.getMessages(await resolve(salon), { limit })
  // Regroupe par album, en gardant l'ordre chronologique.
  const groups = new Map()
  for (const m of [...msgs].reverse()) {
    const k = m.groupedId ? String(m.groupedId) : 'm' + m.id
    groups.set(k, [...(groups.get(k) ?? []), m])
  }
  let n = 0, dup = 0
  for (const g of groups.values()) {
    const r = await handleGroup(salon, g, prefs)
    if (r === 'inserted') n++; else if (r === 'duplicate') dup++
  }
  log(`Backfill « ${salon.title} » : ${n} nouvelles, ${dup} doublons.`)
}

const entityCache = new Map()
async function resolve(salon) {
  if (entityCache.has(salon.tg_chat_id)) return entityCache.get(salon.tg_chat_id)
  // Un salon peut être identifié par son @username ou son id numérique.
  const ref = salon.username?.trim()
    ? salon.username.replace(/^@/, '')
    : BigInt(salon.tg_chat_id)
  const e = await client.getEntity(ref)
  entityCache.set(salon.tg_chat_id, e)
  return e
}

// ── Boucle principale ────────────────────────────────────────────────────────
async function main() {
  await client.connect()
  const me = await client.getMe()
  log(`Connecté en tant que ${me.username ? '@' + me.username : me.firstName}.`)

  let salons = await store.salons()
  let prefs = await store.prefs()
  if (!salons.length) {
    log('Aucun salon actif. Ajoute-les depuis l\'app : Talents → Salons.')
  }
  log(`${salons.length} salon(s) écouté(s) : ${salons.map(s => s.title).join(', ') || '—'}`)

  // Index id Telegram → salon, pour router les messages entrants.
  let byChat = new Map()
  async function reindex() {
    byChat = new Map()
    for (const s of salons) {
      try {
        const e = await resolve(s)
        byChat.set(String(e.id), s)
      } catch (err) {
        log(`Salon « ${s.title} » introuvable : ${err.message}`)
        await store.salonError(s.id, err.message)
      }
    }
  }
  await reindex()

  if (BACKFILL) for (const s of salons) {
    try { await backfill(s, prefs) } catch (e) { log('Backfill échoué :', e.message); await store.salonError(s.id, e.message) }
  }

  client.addEventHandler(async event => {
    const msg = event.message
    const chatId = String(msg.peerId?.channelId ?? msg.peerId?.chatId ?? msg.chatId ?? '')
    const salon = byChat.get(chatId)
    if (!salon) return
    queue(salon, msg, prefs)
  }, new NewMessage({}))

  // La liste des salons et les filtres changent depuis l'app : on relit
  // périodiquement plutôt que d'exiger un redémarrage du worker.
  setInterval(async () => {
    try {
      const next = await store.salons()
      const changed = next.map(s => s.id).sort().join() !== salons.map(s => s.id).sort().join()
      salons = next
      prefs = await store.prefs()
      if (changed) { await reindex(); log(`Salons rechargés : ${salons.map(s => s.title).join(', ') || '—'}`) }
    } catch (e) { log('Rechargement des salons :', e.message) }
  }, 60_000)

  log('En écoute. Ctrl+C pour arrêter.')
}

main().catch(e => { console.error(e); process.exit(1) })
