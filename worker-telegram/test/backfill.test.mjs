// Le rattrapage doit remonter loin quand c'est utile, et s'arrêter tôt sinon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createIngestor } from '../src/ingest.mjs'

/** Un salon simulé : N annonces, de la plus récente à la plus ancienne. */
function fakeClient(count) {
  const msgs = []
  for (let i = count; i > 0; i--) {
    msgs.push({
      id: i, date: Date.now() / 1000 - i * 60, groupedId: null, photo: null,
      message: `Listing ID #${1000 + i}\nAge: 22\nOrigin: Peru\nPrice: $${500 + i}\nEnglish Level: 3`,
    })
  }
  return { getMessages: async () => msgs, downloadMedia: async () => null }
}

/** Store minimal : garde les clés vues, comme le ferait le vrai. */
function fakeStore(known = new Set()) {
  const inserted = []
  return {
    known, inserted,
    async prefs() { return {} },
    async savePhotos() { return [] },
    async salonError() {},
    async saveListing({ parsed }) {
      if (known.has(parsed.dedupeKey)) return 'duplicate'
      known.add(parsed.dedupeKey); inserted.push(parsed.dedupeKey)
      return 'inserted'
    },
  }
}

const SALON = { id: 's1', title: 'Test' }
const quiet = () => {}

test('premier passage : tout est ingéré', async () => {
  const store = fakeStore()
  const ing = createIngestor({ client: fakeClient(50), store, log: quiet })
  const r = await ing.backfill(SALON, null, 600)
  assert.equal(r.inserted, 50)
  assert.equal(r.stopped, false)
})

test('second passage : s’arrête au lieu de tout reparcourir', async () => {
  const store = fakeStore()
  const ing = createIngestor({ client: fakeClient(200), store, log: quiet })
  await ing.backfill(SALON, null, 600)

  const again = await ing.backfill(SALON, null, 600)
  assert.equal(again.inserted, 0)
  assert.ok(again.stopped, 'le parcours aurait dû s’arrêter')
  assert.ok(again.scanned <= 30, `${again.scanned} messages relus, attendu ≈25`)
})

test('nouvelles annonces en tête : ingérées avant l’arrêt', async () => {
  const store = fakeStore()
  const ing = createIngestor({ client: fakeClient(100), store, log: quiet })
  await ing.backfill(SALON, null, 600)

  // Le salon a publié 5 annonces depuis : elles sont les plus récentes.
  const ing2 = createIngestor({ client: fakeClient(105), store, log: quiet })
  const r = await ing2.backfill(SALON, null, 600)
  assert.equal(r.inserted, 5)
  assert.ok(r.stopped)
})

test('deep force le parcours complet', async () => {
  const store = fakeStore()
  const ing = createIngestor({ client: fakeClient(80), store, log: quiet })
  await ing.backfill(SALON, null, 600)
  const r = await ing.backfill(SALON, null, 600, { deep: true })
  assert.equal(r.stopped, false)
  assert.equal(r.scanned, 80)
})
