// Écriture Supabase : salons, annonces, photos. Le worker utilise la clé
// service role — il tourne sur ta machine ou ton VPS, jamais dans le front.
import { createClient } from '@supabase/supabase-js'
import { hardFilter } from '../../shared/talents/score.mjs'

export function makeStore(env) {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const orgId = env.ORG_ID

  return {
    db,

    /** Les salons actifs à écouter, tels que configurés depuis l'app. */
    async salons() {
      const { data, error } = await db.from('talent_salons')
        .select('*').eq('org_id', orgId).eq('active', true)
      if (error) throw error
      return data ?? []
    },

    async prefs() {
      const { data } = await db.from('talent_prefs').select('prefs').eq('org_id', orgId).maybeSingle()
      return data?.prefs ?? {}
    },

    async salonError(salonId, message) {
      await db.from('talent_salons').update({ last_error: message }).eq('id', salonId)
    },

    /** Photos → bucket public `talents`. Retourne les chemins stockés. */
    async savePhotos(photos, keyPrefix) {
      const out = []
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i]
        const path = `${orgId}/${keyPrefix}/${i}.jpg`
        const { error } = await db.storage.from('talents')
          .upload(path, p.buffer, { contentType: 'image/jpeg', upsert: true })
        if (error && !/exists/i.test(error.message)) { console.warn('  photo:', error.message); continue }
        const { data } = db.storage.from('talents').getPublicUrl(path)
        out.push({ path, url: data.publicUrl, hash: p.hash })
      }
      return out
    },

    /** Cette annonce est-elle déjà en base, photos comprises ? */
    async hasPhotos(key) {
      const { data } = await db.from('talent_listings')
        .select('photos').eq('org_id', orgId).eq('dedupe_key', key).maybeSingle()
      return Array.isArray(data?.photos) && data.photos.length > 0
    },

    /** Ajoute les photos à une annonce déjà enregistrée qui n'en avait pas. */
    async completePhotos(key, photos) {
      const { data } = await db.from('talent_listings')
        .select('id, photos').eq('org_id', orgId).eq('dedupe_key', key).maybeSingle()
      if (!data || (Array.isArray(data.photos) && data.photos.length)) return false
      await db.from('talent_listings').update({ photos }).eq('id', data.id)
      return true
    },

    /**
     * Insère une annonce. Retourne 'inserted' | 'duplicate'.
     * Le dédoublonnage est une contrainte d'unicité en base : deux workers
     * concurrents ne peuvent pas créer de doublon, même en course.
     */
    async saveListing({ salonId, salonTitle, msgId, groupedId, parsed, photos, postedAt, prefs }) {
      const reasons = hardFilter(parsed.fields, prefs)
      const status = !parsed.isListing || parsed.confidence < 0.35 ? 'review'
        : reasons.length ? 'filtered'
        : 'inbox'

      const row = {
        org_id: orgId,
        salon_id: salonId,
        tg_message_id: msgId,
        tg_grouped_id: groupedId ? String(groupedId) : null,
        listing_id: parsed.fields.listing_id ?? null,
        posted_at: postedAt,
        raw_text: parsed.raw,
        fields: parsed.fields,
        photos,
        parse_confidence: Number(parsed.confidence.toFixed(3)),
        status,
        filter_reasons: reasons,
        dedupe_key: parsed.dedupeKey,
        seen_in: [{ salon: salonTitle, at: postedAt }],
      }

      const { error } = await db.from('talent_listings').insert(row)
      if (!error) return 'inserted'
      if (error.code === '23505') {
        // Déjà connue : on note seulement le salon supplémentaire où elle est repostée.
        const { data: prev } = await db.from('talent_listings')
          .select('id, seen_in').eq('org_id', orgId).eq('dedupe_key', parsed.dedupeKey).maybeSingle()
        if (prev) {
          const seen = Array.isArray(prev.seen_in) ? prev.seen_in : []
          if (!seen.some(s => s.salon === salonTitle)) {
            await db.from('talent_listings')
              .update({ seen_in: [...seen, { salon: salonTitle, at: postedAt }] }).eq('id', prev.id)
          }
        }
        return 'duplicate'
      }
      throw error
    },
  }
}
