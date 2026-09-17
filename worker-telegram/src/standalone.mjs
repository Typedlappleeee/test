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
import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnv } from './env.mjs'
import { makeLocalStore } from './store-local.mjs'
import { createIngestor } from './ingest.mjs'
import { parseListing, dedupeKey } from '../../shared/talents/parse.mjs'
import { hardFilter } from '../../shared/talents/score.mjs'
import { analyzeListing, ATTRIBUTES } from './vision.mjs'

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

/* ── Accès ───────────────────────────────────────────────────────────────── */
// Sans mot de passe, l'interface est réservée à `localhost` : elle donne accès
// aux annonces captées et permet de transférer depuis le compte Telegram. Dès
// qu'on l'expose — tunnel, réseau local, VPS — un mot de passe devient
// indispensable. Défini dans .env, il est exigé partout.
const PASSWORD = (env.UI_PASSWORD || '').trim()
const COOKIE = 'td_auth'

// Jeton dérivé du mot de passe : le cookie ne transporte jamais le mot de passe,
// et invalider l'accès revient à changer UI_PASSWORD.
const TOKEN = PASSWORD
  ? createHash('sha256').update('talent-deck|' + PASSWORD).digest('hex').slice(0, 32)
  : null

/** Comparaison à durée constante : une comparaison naïve fuit le préfixe correct. */
function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

function isAuthorised(req) {
  if (!TOKEN) return true
  const cookie = /(?:^|;\s*)td_auth=([^;]+)/.exec(req.headers.cookie || '')
  if (cookie && sameSecret(decodeURIComponent(cookie[1]), TOKEN)) return true
  // En-tête, pour appeler l'API depuis un script ou une autre application.
  return sameSecret(req.headers['x-talent-deck-key'], PASSWORD)
}

const LOGIN_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Talent Deck</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0E0D0C; color:#F6F1E9; font:15px/1.5 system-ui,-apple-system,sans-serif }
  form { width:min(340px,90vw); display:flex; flex-direction:column; gap:12px;
         padding:26px; border:1px solid #2A2723; border-radius:14px; background:#141311 }
  h1 { margin:0 0 4px; font-size:19px; letter-spacing:-.02em }
  p { margin:0; font-size:12.5px; color:#7D766B }
  input { padding:10px 12px; border-radius:9px; border:1px solid #2A2723; background:#1A1816; color:inherit; font:inherit }
  button { padding:10px; border:none; border-radius:9px; background:#F9AA60; color:#17140F;
           font:inherit; font-weight:700; cursor:pointer }
  .err { color:#FF9479; font-size:12.5px }
</style></head><body>
<form method="POST" action="/login">
  <h1>Talent Deck</h1>
  <p>Cet espace est protégé par un mot de passe.</p>
  <input type="password" name="password" placeholder="Mot de passe" autofocus required>
  <button type="submit">Entrer</button>
  __ERR__
</form></body></html>`

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  try {
    if (TOKEN) {
      if (path === '/login' && req.method === 'POST') {
        const body = await new Promise(r => { let b = ''; req.on('data', c => { b += c }); req.on('end', () => r(b)) })
        const given = decodeURIComponent((/(?:^|&)password=([^&]*)/.exec(body)?.[1] ?? '').replace(/\+/g, ' '))
        if (sameSecret(given, PASSWORD)) {
          res.writeHead(302, {
            location: '/',
            // `Secure` est omis : derrière un tunnel la connexion est chiffrée,
            // mais en réseau local l'accès reste en clair et le cookie doit valoir.
            'set-cookie': `${COOKIE}=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
          })
          return res.end()
        }
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
        return res.end(LOGIN_PAGE.replace('__ERR__', '<span class="err">Mot de passe incorrect.</span>'))
      }
      if (!isAuthorised(req)) {
        if (path.startsWith('/api/')) return json(res, 401, { error: 'Mot de passe requis' })
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
        return res.end(LOGIN_PAGE.replace('__ERR__', ''))
      }
    }

    if (path === '/api/state') return json(res, 200, publicState())
    if (path === '/api/vision/attributes') return json(res, 200, { attributes: ATTRIBUTES })

    if (path === '/api/targets') {
      if (!client || !tg) return json(res, 200, { targets: [], offline: true })
      return json(res, 200, { targets: await tg.listTargets(client) })
    }

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
        case '/api/decide': {
          store.decide(body.id, body.decision)
          if (body.decision === 'match') queueForward(body.id)
          break
        }
        case '/api/undecide': store.undecide(body.id); break
        case '/api/stage':    store.setStage(body.id, body.stage); break
        case '/api/note':     store.setNote(body.id, body.note); break
        case '/api/prefs':    store.setPrefs(body.prefs); break
        case '/api/reset-decisions': store.resetDecisions(); break
        case '/api/restore': store.restore(body.id); break
        // CRM : un point d'entrée par verbe, la collection est dans le corps.
        case '/api/crm/put':    return json(res, 200, { row: store.crmPut(body.collection, body.row || {}) })
        case '/api/crm/remove': store.crmRemove(body.collection, body.id); break
        case '/api/crm/reset':  store.crmReset(body.collection); break
        case '/api/vision/run': void runVision(); break
        // Rattraper les matchs jamais transférés — bouton explicite : les
        // renvoyer d'office au démarrage expédierait tout l'historique d'un coup.
        case '/api/forward/pending': {
          for (const l of store.data.listings) {
            if (store.data.decisions[l.id] === 'match' && !l.forwarded) queueForward(l.id)
          }
          break
        }
        // Renvoyer à la main un match déjà pris (ou dont le transfert a échoué).
        case '/api/forward': {
          const l = store.data.listings.find(x => x.id === body.id)
          if (l?.forwarded?.mode === 'error' || !l?.forwarded) { if (l) l.forwarded = null; queueForward(body.id) }
          break
        }
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
          // Sans interface depuis la fusion des écrans, mais toujours joignable
          // pour éprouver un format de salon :
          //   curl -X POST localhost:8787/api/paste -H "content-type: application/json" -d "{\"raw\":\"…\"}"

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
    listings: d.listings, salons: d.salons, decisions: d.decisions, crm: d.crm,
    stages: d.stages, notes: d.notes, prefs: d.prefs,
    stats: d.stats,
    telegram: { connected: !!client, demo: DEMO, me: meLabel },
    vision: visionState,
    forward: forwardState,
  }
}

/* ── Transfert des matchs ────────────────────────────────────────────────── */
// Quand une annonce est retenue, l'envoyer dans un salon à soi — pour que
// l'équipe la voie avec ses photos, sans copier-coller.
//
// Une file, pas d'envois directs : Telegram sanctionne les rafales, et un tri
// rapide peut produire dix matchs en dix secondes. Les transferts partent donc
// un par un, espacés, et une annonce déjà envoyée ne repart jamais.
const FORWARD_GAP_MS = 4000

const forwardQueue = []
const forwardState = { pending: 0, sent: 0, lastError: null, running: false }

function queueForward(listingId) {
  const l = store.data.listings.find(x => x.id === listingId)
  if (!l || l.forwarded) return
  if (forwardQueue.includes(listingId)) return
  forwardQueue.push(listingId)
  forwardState.pending = forwardQueue.length
  void drainForwards()
}

async function drainForwards() {
  if (forwardState.running || !client || !resolve) return
  forwardState.running = true
  try {
    while (forwardQueue.length) {
      const prefs = await store.prefs()
      const target = prefs.forward_to
      if (!prefs.forward_enabled || !target) break

      const id = forwardQueue.shift()
      forwardState.pending = forwardQueue.length
      const l = store.data.listings.find(x => x.id === id)
      if (!l || l.forwarded) continue

      try {
        const { forwardListing } = await import('./telegram.mjs')
        const salon = store.data.salons.find(s => s.id === l.salonId)
        const toEntity = await client.getEntity(target === 'me' ? 'me' : BigInt(target))
        const fromEntity = salon ? await resolve(salon) : null
        const ids = (l.msgIds?.length ? l.msgIds : [l.msgId]).filter(n => Number.isFinite(n))

        if (!fromEntity || !ids.length) throw new Error('message d’origine introuvable')

        const res = await forwardListing(client, {
          fromEntity, toEntity, msgIds: ids,
          fallbackText: l.raw,
          fallbackFiles: (l.photos ?? []).map(p => store.pathOf(p)).filter(Boolean),
        })
        store.markForwarded(id, res)
        forwardState.sent++
        forwardState.lastError = null
        log(`  → transféré (${res.mode}) : ${l.fields?.listing_id ? '#' + l.fields.listing_id : l.id}`)
      } catch (e) {
        forwardState.lastError = e.message
        log('  transfert impossible : ' + e.message)
        store.markForwarded(id, { mode: 'error', why: e.message })
      }
      store.touch()
      if (forwardQueue.length) await new Promise(r => setTimeout(r, FORWARD_GAP_MS))
    }
  } finally {
    forwardState.running = false
    forwardState.pending = forwardQueue.length
    store.touch()
  }
}

/* ── Lecture des photos ──────────────────────────────────────────────────── */
// Analyser tout un parc prend du temps : on annonce l'avancement à l'interface
// plutôt que de la laisser attendre sans rien dire.
const visionState = { running: false, done: 0, total: 0, error: null }

async function runVision() {
  if (visionState.running) return
  const todo = store.data.listings.filter(l => l.photos?.length && !l.vision)
  visionState.running = true
  visionState.done = 0
  visionState.total = todo.length
  visionState.error = null
  store.touch()
  log(`lecture des photos : ${todo.length} annonce(s) à analyser…`)
  try {
    for (const l of todo) {
      const paths = l.photos.map(p => store.pathOf(p)).filter(Boolean)
      const v = await analyzeListing(paths, log)
      store.setVision(l.id, v)
      visionState.done++
      if (visionState.done % 5 === 0) store.touch()
    }
    log(`lecture des photos terminée : ${visionState.done} annonce(s).`)
  } catch (e) {
    visionState.error = e.message
    log('lecture des photos interrompue : ' + e.message)
  } finally {
    visionState.running = false
    store.touch()
  }
}

if (process.argv.includes('--vision')) setTimeout(runVision, 500)

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
    const limit = Number(env.BACKFILL_LIMIT || 600)
    log(`rattrapage de « ${salon.title} » (jusqu'à ${limit} messages)…`)
    const r = await ingestor.backfill(salon, await resolve(salon), limit)
    log(`« ${salon.title} » : ${r.inserted} nouvelle(s), ${r.duplicate} déjà connue(s)`
      + (r.stopped ? ` — arrêté après ${r.scanned} messages, la suite est déjà en base.` : ` sur ${r.scanned} messages.`))
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
  const configured = (await store.salons()).length
  if (names.length) log(`écoute : ${names.join(', ')}`)
  else if (configured) log(`\x1b[31m${configured} salon(s) configuré(s) mais aucun joignable\x1b[0m — voir l’erreur ci-dessus ; retire-le et rajoute-le depuis l’onglet Salons.`)
  else log('aucun salon actif — ajoute-les depuis l’interface, onglet Salons')

  client.addEventHandler(async ev => {
    const salon = watched.get(tg.chatIdOf(ev.message))
    if (salon) ingestor.queue(salon, ev.message)
  }, new NewMessage({}))

  if (BACKFILL) for (const s of watched.values()) await backfillOne(s)

  void drainForwards()
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
// Relancer sans avoir fermé la fenêtre précédente est le faux pas le plus
// courant : « EADDRINUSE » ne dit rien à personne.
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error('')
    console.error('  \x1b[31mLe port ' + PORT + ' est déjà pris.\x1b[0m')
    console.error('  Talent Deck tourne sans doute déjà dans une autre fenêtre :')
    console.error('  ouvre \x1b[4mhttp://localhost:' + PORT + '\x1b[0m, ou ferme cette fenêtre-là avec Ctrl+C.')
    console.error('  Pour en lancer un second en parallèle : \x1b[35mset PORT=8788 && npm start\x1b[0m')
    console.error('')
  } else {
    console.error(e)
  }
  process.exit(1)
})

server.listen(PORT, async () => {
  console.log('')
  console.log('  \x1b[35m▸ Talent Deck\x1b[0m — ouvre \x1b[4mhttp://localhost:' + PORT + '\x1b[0m')
  console.log(PASSWORD
    ? '  \x1b[32m🔒 Protégé par mot de passe\x1b[0m — exposable via un tunnel.'
    : '  \x1b[33m⚠ Aucun mot de passe\x1b[0m — à réserver à localhost. Ajoute UI_PASSWORD dans .env pour l’exposer.')
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
