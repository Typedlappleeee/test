// Ingestion : de messages Telegram bruts à une annonce enregistrée.
//
// Le point délicat, et la raison d'être de ce module : dans Telegram une
// annonce à plusieurs photos arrive en PLUSIEURS messages qui partagent un
// `groupedId`, et le texte n'est que sur l'un d'eux. Traiter message par
// message donnerait une annonce sans photos suivie de trois photos sans
// annonce. On bufferise donc par album et on ne traite qu'après un silence.
//
// Le stockage est injecté (`store`) : Supabase ou disque local, l'ingestion
// est la même.
import { createHash } from 'node:crypto'
import { parseListing, dedupeKey } from '../../shared/talents/parse.mjs'
import { analyzeListing } from './vision.mjs'

export const ALBUM_WAIT_MS = 2500
export const MAX_PHOTOS = 4

export function createIngestor({ client, store, log = console.log }) {
  const buffers = new Map()

  /**
   * Un message porte une image de deux façons : `photo` (envoi compressé,
   * le cas courant) ou `document` avec un mime image/* (envoi « en fichier »).
   * Les salons utilisent les deux, il faut donc accepter les deux.
   */
  function imageOf(m) {
    if (m.photo) return 'photo'
    const doc = m.document ?? (m.media && m.media.document)
    if (doc?.mimeType?.startsWith?.('image/')) return 'document'
    return null
  }

  async function downloadPhotos(messages) {
    const out = []
    let seen = 0
    for (const m of messages) {
      if (out.length >= MAX_PHOTOS) break
      if (!imageOf(m)) continue
      seen++
      try {
        // Sans option : GramJS télécharge le média en pleine taille. Passer
        // `thumb` demanderait une miniature — et un index de miniature
        // invalide ne renvoie rien du tout.
        const buffer = await client.downloadMedia(m)
        if (!buffer?.length) { log('  photo vide (message ' + m.id + ')'); continue }
        out.push({ buffer, hash: createHash('sha1').update(buffer).digest('hex').slice(0, 16) })
      } catch (e) { log('  photo non téléchargée (message ' + m.id + ') : ' + e.message) }
    }
    if (seen && !out.length) log('  ' + seen + ' image(s) repérée(s) mais aucune téléchargée')
    return out
  }

  /** Un groupe de messages = une annonce. Retourne 'inserted' | 'duplicate' | 'skipped'. */
  async function handleGroup(salon, messages) {
    const text = messages.map(m => m.message || m.text || '').find(t => t && t.trim().length > 20)
    if (!text) return 'skipped'

    const parsed = parseListing(text)

    // Quand le salon fournit une référence (« Listing ID #8260 »), la clé de
    // dédoublonnage ne dépend pas des photos : on peut donc savoir AVANT de
    // télécharger si l'annonce est déjà en base avec ses images, et s'épargner
    // le transfert. C'est ce qui rend un second rattrapage quasi instantané.
    if (parsed.fields.listing_id && store.hasPhotos) {
      const preKey = dedupeKey(parsed.fields, parsed.raw, [])
      if (await store.hasPhotos(preKey)) return 'duplicate'
    }

    const photos = await downloadPhotos(messages)
    parsed.dedupeKey = dedupeKey(parsed.fields, parsed.raw, photos.map(p => p.hash))

    const first = messages[0]
    const stored = photos.length
      ? await store.savePhotos(photos, parsed.dedupeKey.replace(/[^a-z0-9]/gi, ''))
      : []

    // Lecture des photos, si elle est activée dans les réglages. Elle ajoute
    // ~50 ms par image ; on ne la fait donc qu'une fois, à l'ingestion.
    let vision = null
    const prefs = await store.prefs()
    if (prefs.vision_enabled && stored.length) {
      try { vision = await analyzeListing(stored.map(p => store.pathOf(p)).filter(Boolean), log) }
      catch (e) { log('  lecture des photos indisponible : ' + e.message) }
    }

    const res = await store.saveListing({
      salonId: salon.id,
      salonTitle: salon.title,
      msgId: Number(first.id),
      // Tous les messages de l'album : un transfert doit emporter les photos,
      // qui vivent dans des messages distincts du texte.
      msgIds: messages.map(m => Number(m.id)).filter(Number.isFinite),
      groupedId: first.groupedId ?? null,
      parsed,
      photos: stored,
      vision,
      postedAt: new Date((Number(first.date) || Date.now() / 1000) * 1000).toISOString(),
      prefs,
    })

    // Une annonce déjà en base mais sans photo doit pouvoir les récupérer :
    // sinon, ingérée une fois sans images, elle resterait sans images à jamais.
    let completed = false
    if (res === 'duplicate' && stored.length && store.completePhotos) {
      completed = await store.completePhotos(parsed.dedupeKey, stored)
    }

    const who = parsed.fields.listing_id ? '#' + parsed.fields.listing_id : (parsed.fields.origin ?? '?')
    const label = completed ? 'photos +' : res
    log(`  ${res === 'inserted' || completed ? '✓' : '·'} ${label.padEnd(9)} ${who} · ${stored.length} photo(s) · lu à ${Math.round(parsed.confidence * 100)} %`)
    return res
  }

  /** Met un message en file ; l'album est traité après ALBUM_WAIT_MS de silence. */
  function queue(salon, message) {
    const key = `${salon.id}:${message.groupedId ?? 'm' + message.id}`
    const entry = buffers.get(key) ?? { messages: [], timer: null }
    entry.messages.push(message)
    clearTimeout(entry.timer)
    entry.timer = setTimeout(async () => {
      buffers.delete(key)
      try { await handleGroup(salon, entry.messages.sort((a, b) => a.id - b.id)) }
      catch (e) { log('  erreur :', e.message); await store.salonError(salon.id, e.message) }
    }, ALBUM_WAIT_MS)
    buffers.set(key, entry)
  }

  /** Rattrape l'historique d'un salon, du plus ancien au plus récent. */
  /**
   * Rattrape l'historique d'un salon, du message le plus récent vers le passé.
   *
   * Ce sens a une conséquence utile : dès qu'on retombe sur une série
   * d'annonces déjà en base, c'est que tout ce qui précède l'est aussi. On
   * s'arrête alors, ce qui permet de fixer une limite large — remonter loin
   * après plusieurs jours d'arrêt — sans payer ce prix chaque jour quand il
   * n'y a rien de neuf. `deep` force le parcours complet.
   */
  async function backfill(salon, entity, limit, { deep = false, stopAfter = 25 } = {}) {
    const msgs = await client.getMessages(entity, { limit })
    const groups = new Map()
    for (const m of msgs) {                       // du plus récent au plus ancien
      const k = m.groupedId ? String(m.groupedId) : 'm' + m.id
      groups.set(k, [...(groups.get(k) ?? []), m])
    }

    let inserted = 0, duplicate = 0, scanned = 0, streak = 0, stopped = false
    for (const g of groups.values()) {
      const r = await handleGroup(salon, g)
      scanned++
      if (r === 'inserted') { inserted++; streak = 0 }
      else if (r === 'duplicate') { duplicate++; streak++ }
      // Les messages qui ne sont pas des annonces ne cassent pas la série :
      // un salon poste aussi des bannières entre deux annonces.
      if (!deep && streak >= stopAfter) { stopped = true; break }
    }
    return { inserted, duplicate, scanned, total: groups.size, stopped }
  }

  return { queue, backfill, handleGroup }
}
