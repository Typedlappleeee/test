// Stockage sur disque : aucune base de données, aucun compte.
//
// Tout vit dans `data/` : un fichier JSON pour les annonces et tes décisions,
// un dossier pour les photos. Sauvegarder ton travail = copier ce dossier.
// À l'échelle qui nous intéresse (quelques dizaines de milliers d'annonces),
// un JSON tenu en mémoire et réécrit après chaque changement est plus simple
// qu'un moteur SQL, et assez rapide pour ne jamais se remarquer.
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hardFilter, DEFAULT_PREFS } from '../../shared/talents/score.mjs'
import { visionFilter } from './vision.mjs'
import { CRM_SEED } from './crm-seed.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const EMPTY = {
  version: 1,
  salons: [],      // { id, chatId, title, username, kind, active, addedAt, lastSeenAt, lastError, count }
  listings: [],    // { id, salonId, salonTitle, msgId, msgIds, listingId, postedAt, raw, fields, photos, vision, confidence, status, reasons, key, seenIn, forwarded }
  decisions: {},   // id -> 'match' | 'pass' | 'later'
  stages: {},      // id -> étape du pipeline
  notes: {},
  prefs: { ...DEFAULT_PREFS },
  stats: { duplicates: 0 },
  // Le reste du CRM : créatrices, comptes, équipe, contenu… Chaque clé est une
  // collection d'objets portant un `id`, manipulée par le CRUD générique
  // ci-dessous plutôt que par seize séries de méthodes quasi identiques.
  crm: {},
}

/** Collections du CRM et leur préfixe d'identifiant. */
export const CRM_COLLECTIONS = {
  creators: 'cr', accounts: 'ac', employees: 'em', seqs: 'sq', bank: 'bk',
  sops: 'sop', inspos: 'in', groups: 'gr', opLinks: 'lk', shiftReports: 'sh',
  invites: 'iv', roles: 'ro', accessRoles: 'ar', networks: 'nw', team: 'tm',
  libItems: 'li',
}

export function makeLocalStore(dataDir = join(ROOT, 'data')) {
  const photosDir = join(dataDir, 'photos')
  const file = join(dataDir, 'db.json')
  mkdirSync(photosDir, { recursive: true })

  let db = EMPTY
  if (existsSync(file)) {
    try { db = { ...EMPTY, ...JSON.parse(readFileSync(file, 'utf8')) } }
    catch (e) { console.warn('data/db.json illisible, on repart à vide :', e.message) }
  }

  // Première ouverture : on charge le jeu d'exemple, pour que les écrans
  // montrent quelque chose plutôt qu'une série de pages vides. Une collection
  // déjà présente — même vidée volontairement — n'est jamais réécrite.
  db.crm = db.crm ?? {}
  for (const name of Object.keys(CRM_COLLECTIONS)) {
    if (!Array.isArray(db.crm[name])) db.crm[name] = structuredClone(CRM_SEED[name] ?? [])
  }

  let dirty = false, flushing = null
  // Écriture par un fichier temporaire puis renommage : une coupure au mauvais
  // moment ne peut pas laisser un db.json tronqué.
  function persist() {
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(db))
    renameSync(tmp, file)
    dirty = false
  }
  function schedule() {
    dirty = true
    if (flushing) return
    flushing = setTimeout(() => { flushing = null; if (dirty) persist() }, 400)
  }

  const byKey = new Map(db.listings.map(l => [l.key, l]))
  const listeners = new Set()
  const notify = kind => { for (const fn of listeners) { try { fn(kind) } catch { /* un abonné mort ne bloque pas les autres */ } } }

  return {
    // ── Lecture ───────────────────────────────────────────────────────────
    get data() { return db },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async prefs() { return db.prefs },
    async salons() { return db.salons.filter(s => s.active) },

    // ── Salons ────────────────────────────────────────────────────────────
    addSalon(s) {
      if (db.salons.some(x => x.chatId === s.chatId)) return null
      const row = {
        id: 'salon-' + s.chatId, chatId: String(s.chatId), title: s.title,
        username: s.username ?? null, kind: s.kind ?? 'channel',
        active: true, addedAt: Date.now(), lastSeenAt: null, lastError: null, count: 0,
      }
      db.salons.push(row); schedule(); notify('salons')
      return row
    },
    setSalonActive(id, active) {
      const s = db.salons.find(x => x.id === id)
      if (s) { s.active = !!active; schedule(); notify('salons') }
      return s
    },
    removeSalon(id) {
      db.salons = db.salons.filter(x => x.id !== id)
      schedule(); notify('salons')
    },
    async salonError(id, message) {
      const s = db.salons.find(x => x.id === id)
      if (s) { s.lastError = message; schedule(); notify('salons') }
    },

    // ── Photos ────────────────────────────────────────────────────────────
    async savePhotos(photos, keyPrefix) {
      const dir = join(photosDir, keyPrefix)
      mkdirSync(dir, { recursive: true })
      return photos.map((p, i) => {
        const name = `${i}.jpg`
        writeFileSync(join(dir, name), p.buffer)
        // URL servie par le serveur local, pas un chemin disque : l'UI la met
        // telle quelle dans un <img>.
        return { url: `/photos/${keyPrefix}/${name}`, hash: p.hash }
      })
    },

    /** Chemin disque d'une photo, à partir de l'URL servie à l'interface. */
    pathOf(photo) {
      const m = String(photo?.url || '').match(/^\/photos\/(.+)$/)
      return m ? join(photosDir, m[1]) : null
    },

    // ── Annonces ──────────────────────────────────────────────────────────
    async saveListing({ salonId, salonTitle, msgId, msgIds, parsed, photos, vision, postedAt, prefs }) {
      const existing = byKey.get(parsed.dedupeKey)
      if (existing) {
        db.stats.duplicates++
        if (!existing.seenIn.includes(salonTitle)) existing.seenIn.push(salonTitle)
        schedule(); notify('listings')
        return 'duplicate'
      }
      // Les critères visuels s'ajoutent aux critères de texte : même statut,
              // même volet « Écartées », même bouton pour remettre à trier.
              const reasons = [...hardFilter(parsed.fields, prefs), ...visionFilter(vision, prefs)]
      const row = {
        id: parsed.dedupeKey, key: parsed.dedupeKey,
        salonId, salonTitle, msgId, msgIds: msgIds?.length ? msgIds : (msgId != null ? [msgId] : []),
        listingId: parsed.fields.listing_id ?? null,
        postedAt: new Date(postedAt).getTime(),
        raw: parsed.raw, fields: parsed.fields, photos, vision: vision ?? null,
        confidence: Number(parsed.confidence.toFixed(3)),
        status: !parsed.isListing || parsed.confidence < 0.35 ? 'review' : reasons.length ? 'filtered' : 'inbox',
        reasons, seenIn: [salonTitle],
      }
      db.listings.push(row)
      byKey.set(row.key, row)
      const s = db.salons.find(x => x.id === salonId)
      if (s) { s.count++; s.lastSeenAt = Date.now(); s.lastError = null }
      schedule(); notify('listings')
      return 'inserted'
    },

    /** Cette annonce est-elle déjà en base, photos comprises ? */
    hasPhotos(key) {
      const l = byKey.get(key)
      return !!(l && l.photos?.length)
    },

    /** Note qu'une annonce a été transférée, pour ne pas l'envoyer deux fois. */
    markForwarded(id, info) {
      const l = byKey.get(id)
      if (!l) return false
      l.forwarded = { at: Date.now(), ...info }
      schedule(); notify('listings')
      return true
    },

    /** Attache une analyse de photos à une annonce, et rejoue ses filtres. */
    setVision(id, vision) {
      const l = byKey.get(id)
      if (!l) return false
      l.vision = vision
      if (l.status !== 'review') {
        l.reasons = [...hardFilter(l.fields, db.prefs), ...visionFilter(vision, db.prefs)]
        l.status = l.reasons.length ? 'filtered' : 'inbox'
      }
      schedule(); notify('listings')
      return true
    },

    /** Ajoute les photos à une annonce déjà enregistrée qui n'en avait pas. */
    completePhotos(key, photos) {
      const l = byKey.get(key)
      if (!l || l.photos?.length || !photos.length) return false
      l.photos = photos
      schedule(); notify('listings')
      return true
    },

    // ── Décisions et suivi ────────────────────────────────────────────────
    decide(id, decision) {
      if (!byKey.has(id)) return false
      db.decisions[id] = decision
      if (decision === 'match' && !db.stages[id]) db.stages[id] = 'new'
      if (decision === 'pass') delete db.stages[id]
      schedule(); notify('decisions')
      return true
    },
    undecide(id) {
      delete db.decisions[id]; delete db.stages[id]
      schedule(); notify('decisions')
    },
    setStage(id, stage) { db.stages[id] = stage; schedule(); notify('decisions') },
    /**
     * Remet une annonce écartée dans le deck. Un filtre trop serré, ou une
     * annonce mal lue mais exploitable, ne doit pas rester bloquée : on force
     * son statut sans toucher aux règles, qui restent valables pour les autres.
     */
    restore(id) {
      const l = byKey.get(id)
      if (!l) return false
      l.status = 'inbox'
      l.reasons = []
      schedule(); notify('listings')
      return true
    },

    // Efface les décisions sans toucher aux annonces captées : on re-trie un
    // parc déjà ingéré, on ne le perd pas.
    resetDecisions() { db.decisions = {}; db.stages = {}; db.notes = {}; schedule(); notify('decisions') },
    setNote(id, note) { db.notes[id] = note; schedule(); notify('decisions') },

    // ── Filtres ───────────────────────────────────────────────────────────
    // Changer un filtre reclasse aussi les annonces déjà en base : en local
    // rien n'empêche de recalculer, et c'est ce qu'on attend d'un réglage.
    setPrefs(prefs) {
      db.prefs = { ...DEFAULT_PREFS, ...prefs }
      for (const l of db.listings) {
        if (l.status === 'review') continue
        l.reasons = [...hardFilter(l.fields, db.prefs), ...visionFilter(l.vision, db.prefs)]
        l.status = l.reasons.length ? 'filtered' : 'inbox'
      }
      schedule(); notify('listings')
    },

    // ── CRM : un seul jeu d'opérations pour toutes les collections ─────────
    crmList(name) {
      return Array.isArray(db.crm[name]) ? db.crm[name] : []
    },
    crmPut(name, row) {
      if (!(name in CRM_COLLECTIONS)) return null
      const list = this.crmList(name)
      const id = row.id || CRM_COLLECTIONS[name] + '-' + Math.random().toString(36).slice(2, 9)
      const at = list.findIndex(x => x.id === id)
      const next = { ...(at >= 0 ? list[at] : {}), ...row, id }
      if (at >= 0) list[at] = next; else list.push(next)
      db.crm[name] = list
      schedule(); notify('crm')
      return next
    },
    crmRemove(name, id) {
      if (!(name in CRM_COLLECTIONS)) return false
      db.crm[name] = this.crmList(name).filter(x => x.id !== id)
      schedule(); notify('crm')
      return true
    },
    /** Remet une collection à son jeu d'exemple. */
    crmReset(name) {
      if (!(name in CRM_COLLECTIONS)) return false
      db.crm[name] = structuredClone(CRM_SEED[name] ?? [])
      schedule(); notify('crm')
      return true
    },

    /** Force une notification : l'avancement d'une analyse n'est pas un écrit. */
    touch() { notify('progress') },

    flush() { if (dirty) persist() },
  }
}
