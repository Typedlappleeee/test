// Talent Deck — mode local tout-en-un.
//
//   node src/standalone.mjs           écoute les salons + sert l'interface
//   node src/standalone.mjs --backfill  rattrape d'abord l'historique
//   node src/standalone.mjs --demo      interface seule, avec des annonces d'exemple
//
// Un seul processus : il tient la connexion Telegram, écrit dans data/, et
// sert http://localhost:8787. Rien d'autre à installer, aucun compte à créer.
// Tant qu'il tourne, les annonces arrivent toutes seules.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnv } from './env.mjs'
import { makeLocalStore } from './store-local.mjs'
import { createIngestor } from './ingest.mjs'
import { parseListing, dedupeKey } from '../../shared/talents/parse.mjs'
import { hardFilter } from '../../shared/talents/score.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DEMO = process.argv.includes('--demo')
const BACKFILL = process.argv.includes('--backfill')
const PORT = Number(process.env.PORT || 8787)

const env = readEnv(DEMO ? [] : ['TG_API_ID', 'TG_API_HASH', 'TG_SESSION'])
const store = makeLocalStore()
const log = (...a) => console.log('\x1b[2m' + new Date().toTimeString().slice(0, 8) + '\x1b[0m', ...a)

/* ── API ─────────────────────────────────────────────────────────────────── */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' }
const sse = new Set()

function json(res, code, body) {
  const s = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) })
  res.end(s)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''
    req.on('data', c => { b += c; if (b.length > 1e6) { req.destroy(); reject(new Error('corps trop gros')) } })
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}) } catch (e) { reject(e) } })
  })
}
// Un fichier n'est servi que s'il est réellement sous la racine autorisée :
// sans ça, « /photos/../../.env » sortirait du dossier.
function safeJoin(base, rel) {
  const p = join(base, normalize(decodeURIComponent(rel)).replace(/^(\.\.[/\\])+/, ''))
  return p.startsWith(base) ? p : null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  try {
    if (path === '/api/state') return json(res, 200, publicState())

    if (path === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      res.write('retry: 2000\n\n')
      sse.add(res)
      req.on('close', () => sse.delete(res))
      return
    }

    if (path === '/api/dialogs') {
      if (!client || !tg) return json(res, 200, { dialogs: [], offline: true })
      return json(res, 200, { dialogs: await tg.listDialogs(client) })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      switch (path) {
        case '/api/decide':   store.decide(body.id, body.decision); break
        case '/api/undecide': store.undecide(body.id); break
        case '/api/stage':    store.setStage(body.id, body.stage); break
        case '/api/note':     store.setNote(body.id, body.note); break
        case '/api/prefs':    store.setPrefs(body.prefs); break
        case '/api/reset-decisions': store.resetDecisions(); break
        case '/api/salon/add': {
          const row = store.addSalon(body)
          if (row && client) { await watchSalons(); if (BACKFILL_NEW) void backfillOne(row) }
          break
        }
        case '/api/salon/toggle': store.setSalonActive(body.id, body.active); if (client) await watchSalons(); break
        case '/api/salon/remove': store.removeSalon(body.id); if (client) await watchSalons(); break
        case '/api/salon/backfill': {
          const s = store.data.salons.find(x => x.id === body.id)
          if (s && client) void backfillOne(s)
          break
        }
        case '/api/paste': {
          // Coller une annonce à la main : même lecteur que l'ingestion.
          const p = parseListing(body.raw || '')
          if (!p.isListing) return json(res, 200, { ok: false, why: 'Pas reconnu comme une annonce' })
          p.dedupeKey = dedupeKey(p.fields, p.raw)
          const r = await store.saveListing({
            salonId: null, salonTitle: 'Collée à la main', msgId: null,
            parsed: p, photos: [], postedAt: new Date().toISOString(), prefs: await store.prefs(),
          })
          return json(res, 200, { ok: r === 'inserted', why: r === 'duplicate' ? 'Déjà en base — même annonce' : null })
        }
        default: return json(res, 404, { error: 'inconnu' })
      }
      return json(res, 200, { ok: true })
    }

    // Fichiers : photos téléchargées, puis l'interface.
    if (path.startsWith('/photos/')) {
      const f = safeJoin(join(ROOT, 'data', 'photos'), path.slice('/photos/'.length))
      if (f && existsSync(f) && statSync(f).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=86400' })
        return res.end(readFileSync(f))
      }
      return json(res, 404, { error: 'photo introuvable' })
    }

    const file = path === '/' ? join(HERE, 'ui', 'index.html') : safeJoin(join(HERE, 'ui'), path)
    if (file && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain; charset=utf-8' })
      return res.end(readFileSync(file))
    }
    return json(res, 404, { error: 'introuvable' })
  } catch (e) {
    log('erreur HTTP :', e.message)
    return json(res, 500, { error: e.message })
  }
})

function publicState() {
  const d = store.data
  return {
    listings: d.listings, salons: d.salons, decisions: d.decisions,
    stages: d.stages, notes: d.notes, prefs: d.prefs,
    stats: d.stats,
    telegram: { connected: !!client, demo: DEMO, me: meLabel },
  }
}

let pushTimer = null
store.onChange(() => {
  // Les messages arrivent parfois par rafales : on regroupe les notifications
  // pour ne pas repeindre l'interface dix fois en une seconde.
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    const payload = 'data: ' + JSON.stringify({ at: Date.now() }) + '\n\n'
    for (const res of sse) { try { res.write(payload) } catch { sse.delete(res) } }
  }, 150)
})

/* ── Telegram ────────────────────────────────────────────────────────────── */
let client = null, ingestor = null, resolve = null, meLabel = null, tg = null
let watched = new Map()
const BACKFILL_NEW = true

async function watchSalons() {
  watched = new Map()
  for (const s of await store.salons()) {
    try { watched.set(String((await resolve(s)).id), s) }
    catch (e) { log(`salon « ${s.title} » introuvable : ${e.message}`); await store.salonError(s.id, e.message) }
  }
}

async function backfillOne(salon) {
  try {
    const limit = Number(env.BACKFILL_LIMIT || 200)
    log(`rattrapage de « ${salon.title} » (${limit} messages)…`)
    const r = await ingestor.backfill(salon, await resolve(salon), limit)
    log(`« ${salon.title} » : ${r.inserted} nouvelles, ${r.duplicate} doublons sur ${r.scanned} messages.`)
  } catch (e) {
    log(`rattrapage échoué (${salon.title}) : ${e.message}`)
    await store.salonError(salon.id, e.message)
  }
}

async function startTelegram() {
  // Import tardif : le mode démo tourne sans la moindre dépendance installée.
  const { connect, listDialogs, makeResolver, chatIdOf } = await import('./telegram.mjs')
  const { NewMessage } = await import('telegram/events/index.js')
  tg = { listDialogs, chatIdOf }
  client = await connect(env)
  const me = await client.getMe()
  meLabel = me.username ? '@' + me.username : (me.firstName || 'compte Telegram')
  log(`connecté à Telegram en tant que ${meLabel}`)

  resolve = makeResolver(client)
  ingestor = createIngestor({ client, store, log })
  await watchSalons()

  const names = [...watched.values()].map(s => s.title)
  log(names.length ? `écoute : ${names.join(', ')}` : 'aucun salon actif — ajoute-les depuis l’interface, onglet Salons')

  client.addEventHandler(async ev => {
    const salon = watched.get(tg.chatIdOf(ev.message))
    if (salon) ingestor.queue(salon, ev.message)
  }, new NewMessage({}))

  if (BACKFILL) for (const s of await store.salons()) await backfillOne(s)
}

/* ── Démo ────────────────────────────────────────────────────────────────── */
async function seedDemo() {
  if (store.data.listings.length) return
  const { sampleText } = await import('./demo-data.mjs')
  const salons = ['OF Market · Modèles', 'Models Marketplace ES', 'Talent Hub LATAM']
  for (let i = 0; i < 40; i++) {
    const raw = sampleText(i)
    const p = parseListing(raw)
    p.dedupeKey = dedupeKey(p.fields, raw)
    await store.saveListing({
      salonId: null, salonTitle: salons[i % 3], msgId: i, parsed: p, photos: [],
      postedAt: new Date(Date.now() - i * 43 * 60000).toISOString(), prefs: await store.prefs(),
    })
  }
  log(`${store.data.listings.length} annonces d’exemple chargées (mode démo).`)
}

/* ── Démarrage ───────────────────────────────────────────────────────────── */
server.listen(PORT, async () => {
  console.log('')
  console.log('  \x1b[35m▸ Talent Deck\x1b[0m — ouvre \x1b[4mhttp://localhost:' + PORT + '\x1b[0m')
  console.log('')
  if (DEMO) { await seedDemo(); log('mode démo : Telegram n’est pas connecté.') }
  else {
    try { await startTelegram() }
    catch (e) {
      log('\x1b[31mconnexion Telegram impossible : ' + e.message + '\x1b[0m')
      log('l’interface reste accessible ; relance `npm run login` si la session a expiré.')
    }
  }
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { store.flush(); log('sauvegardé. À plus.'); process.exit(0) })
}
