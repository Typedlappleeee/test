// Worker d'ingestion, variante Supabase — pour une équipe qui partage un même
// parc d'annonces depuis plusieurs postes. Pour un usage solo, `standalone.mjs`
// fait la même chose sans base à provisionner.
//
//   node src/index.mjs              écoute en continu
//   node src/index.mjs --backfill   rattrape l'historique puis écoute
import { readEnv } from './env.mjs'
import { makeStore } from './store-supabase.mjs'
import { createIngestor } from './ingest.mjs'
import { connect, makeResolver, chatIdOf } from './telegram.mjs'

const env = readEnv(['TG_API_ID', 'TG_API_HASH', 'TG_SESSION', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ORG_ID'])
const BACKFILL = process.argv.includes('--backfill')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const store = makeStore(env)

async function main() {
  const { NewMessage } = await import('telegram/events/index.js')
  const client = await connect(env)
  const me = await client.getMe()
  log(`Connecté en tant que ${me.username ? '@' + me.username : me.firstName}.`)

  const resolve = makeResolver(client)
  const ingestor = createIngestor({ client, store, log })

  let salons = await store.salons()
  let watched = new Map()

  async function reindex() {
    watched = new Map()
    for (const s of salons) {
      try { watched.set(String((await resolve(s)).id), s) }
      catch (e) { log(`Salon « ${s.title} » introuvable : ${e.message}`); await store.salonError(s.id, e.message) }
    }
  }
  await reindex()
  log(`${salons.length} salon(s) : ${salons.map(s => s.title).join(', ') || '—'}`)

  if (BACKFILL) for (const s of salons) {
    try {
      log(`Backfill « ${s.title} »…`)
      const r = await ingestor.backfill(s, await resolve(s), Number(env.BACKFILL_LIMIT || 200))
      log(`« ${s.title} » : ${r.inserted} nouvelles, ${r.duplicate} doublons.`)
    } catch (e) { log('Backfill échoué :', e.message); await store.salonError(s.id, e.message) }
  }

  client.addEventHandler(async ev => {
    const salon = watched.get(chatIdOf(ev.message))
    if (salon) ingestor.queue(salon, ev.message)
  }, new NewMessage({}))

  // Les salons et les filtres changent depuis l'app : on relit périodiquement
  // plutôt que d'exiger un redémarrage du worker.
  setInterval(async () => {
    try {
      const next = await store.salons()
      const changed = next.map(s => s.id).sort().join() !== salons.map(s => s.id).sort().join()
      salons = next
      if (changed) { await reindex(); log(`Salons rechargés : ${salons.map(s => s.title).join(', ') || '—'}`) }
    } catch (e) { log('Rechargement des salons :', e.message) }
  }, 60_000)

  log('En écoute. Ctrl+C pour arrêter.')
}

main().catch(e => { console.error(e); process.exit(1) })
