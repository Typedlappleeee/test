// Parseur d'annonces de marketplace de modèles.
//
// Entrée : le texte brut d'un message Telegram. Sortie : des champs canoniques
// typés + un score de confiance + une clé de dédoublonnage.
//
// Aucune dépendance : ce module tourne tel quel dans le worker Node (ingestion)
// et dans le front Vite (re-parse à la volée, aperçu de template). Un seul
// parseur, donc jamais deux comportements différents entre les deux.

import { ALIAS_INDEX, SECTION_LABELS, SIGNAL_FIELDS } from './fields.mjs'

// ── Normalisation ────────────────────────────────────────────────────────────

/** Retire emojis, variation selectors et espaces exotiques. */
export function stripEmoji(s) {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2190}-\u{21FF}]/gu, ' ')
    .replace(/[  -‍⁠]/g, ' ')
}

/** Libellé → forme comparable : minuscules, sans accent, sans ponctuation. */
export function normLabel(s) {
  return stripEmoji(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[?!*_~`"'’]/g, '')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TRUE_WORDS = new Set(['yes', 'y', 'true', 'oui', 'si', 'sí', 'ok', 'available', 'disponible', 'have', 'has', '1', 'active'])
const FALSE_WORDS = new Set(['no', 'n', 'false', 'non', 'none', 'nope', 'aucun', 'never', '0', 'nada'])

const CURRENCIES = [
  [/\$|usd|dollars?/i, 'USD'], [/€|eur|euros?/i, 'EUR'], [/£|gbp|pounds?/i, 'GBP'],
]

/** « $1100.00 », « 1000 + increases », « 1.2k/month » → { amount, currency, raw }. */
export function parseMoney(raw) {
  const s = String(raw).trim()
  let currency = null
  for (const [re, code] of CURRENCIES) if (re.test(s)) { currency = code; break }
  // Premier nombre du texte, en tolérant 1.200,50 / 1,200.50 / 1.2k.
  const m = s.match(/(\d[\d\s.,]*)\s*(k|K)?/)
  let amount = null
  if (m) {
    let n = m[1].replace(/\s/g, '')
    // Le dernier séparateur est décimal s'il est suivi de 1 ou 2 chiffres.
    const dec = n.match(/[.,](\d{1,2})$/)
    if (dec) n = n.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[1]
    else n = n.replace(/[.,]/g, '')
    amount = Number(n)
    if (m[2]) amount *= 1000
    if (!Number.isFinite(amount)) amount = null
  }
  return { amount, currency, raw: s }
}

/** « 4hs », « 6-8 hours », « 5h/day » → nombre d'heures (borne basse d'une fourchette). */
export function parseHours(raw) {
  const s = String(raw).toLowerCase()
  const m = s.match(/(\d+(?:[.,]\d+)?)/)
  if (!m) return { hours: null, raw: String(raw).trim() }
  const hours = Number(m[1].replace(',', '.'))
  return { hours: Number.isFinite(hours) ? hours : null, raw: String(raw).trim() }
}

export function parseBool(raw) {
  const w = normLabel(raw).split(' ')[0]
  if (TRUE_WORDS.has(w)) return true
  if (FALSE_WORDS.has(w)) return false
  return null
}

export function parseList(raw) {
  return String(raw)
    .split(/[,;/]|\band\b|\bet\b|\by\b|\+/i)
    .map(s => stripEmoji(s).trim())
    .filter(s => s.length > 0 && s.length < 60)
}

/** Valeur brute → valeur typée selon le champ. */
function coerce(field, raw) {
  const v = String(raw).trim()
  switch (field.type) {
    case 'int': { const m = v.match(/\d+/); return m ? Number(m[0]) : null }
    case 'money': return parseMoney(v)
    case 'bool': return parseBool(v)
    case 'list': return parseList(v)
    case 'hours': return parseHours(v)
    case 'handle': { const m = v.match(/@[\w]{3,}/); return m ? m[0] : v || null }
    case 'country': return stripEmoji(v).trim().replace(/\s+/g, ' ') || null
    default: return stripEmoji(v).trim() || null
  }
}

// ── Parseur principal ────────────────────────────────────────────────────────

/**
 * @param {string} text texte brut du message Telegram
 * @returns {{
 *   fields: Record<string, any>,
 *   unknown: Record<string, string>,
 *   confidence: number,
 *   matchedCount: number,
 *   isListing: boolean,
 *   raw: string,
 * }}
 */
export function parseListing(text) {
  const raw = String(text ?? '')
  /** @type {Record<string, any>} */
  const fields = {}
  /** @type {Record<string, string>} */
  const unknown = {}

  const lines = raw.split(/\r?\n/)
  let openSection = null   // champ « texte » ouvert par une ligne « Details: »

  for (const line0 of lines) {
    const line = line0.trim()
    if (!line) { openSection = null; continue }

    // « Listing ID #8260 » — identifiant sans deux-points.
    const hash = line.match(/^[^\w]*\s*(listing|ref|id|contract)?\s*(?:id)?\s*#\s*([\w-]{2,})/i)
    if (hash && !fields.listing_id) { fields.listing_id = hash[2]; openSection = null; continue }

    const colon = line.indexOf(':')
    if (colon > 0 && colon < 70) {
      const rawLabel = line.slice(0, colon)
      const value = line.slice(colon + 1).trim()
      const label = normLabel(rawLabel)

      if (!value && SECTION_LABELS.includes(label)) {
        // « Additional Info: » seul → les lignes suivantes appartiennent au champ.
        const f = ALIAS_INDEX.get(label)
        openSection = f && f.type === 'text' ? f.key : null
        continue
      }

      const field = ALIAS_INDEX.get(label)
      if (field) {
        // Cas « Skrill: Yes » : le libellé EST le moyen de paiement, la valeur
        // dit seulement s'il est accepté. On enregistre le libellé, pas « Yes ».
        const boolValue = parseBool(value)
        if (field.type === 'list' && boolValue !== null) {
          if (boolValue) {
            const tag = stripEmoji(rawLabel).trim()
            fields[field.key] = [...new Set([...(Array.isArray(fields[field.key]) ? fields[field.key] : []), tag])]
          }
          openSection = null
          continue
        }
        const coerced = coerce(field, value)
        // Un libellé répété (ex. deux lignes « Payment ») fusionne au lieu d'écraser.
        if (field.type === 'list' && Array.isArray(fields[field.key])) {
          fields[field.key] = [...new Set([...fields[field.key], ...coerced])]
        } else if (fields[field.key] == null || fields[field.key] === '') {
          fields[field.key] = coerced
        }
        openSection = field.type === 'text' ? field.key : null
        continue
      }

      if (value && label.length > 1 && label.length < 40) unknown[label] = value
      openSection = null
      continue
    }

    // Ligne sans libellé : suite de la section ouverte.
    if (openSection) {
      const prev = fields[openSection]
      fields[openSection] = prev ? `${prev}\n${stripEmoji(line).trim()}` : stripEmoji(line).trim()
    }
  }

  // Filet : un prix isolé sur une ligne (« 💰 1100$ ») quand aucun libellé n'a matché.
  if (fields.price == null) {
    const m = raw.match(/(?:^|\n)[^\n]*?([$€£]\s?\d[\d\s.,]*)/)
    if (m) fields.price = parseMoney(m[1])
  }

  const matchedCount = SIGNAL_FIELDS.filter(k => fields[k] != null && fields[k] !== '').length
  const totalMatched = Object.keys(fields).length
  const confidence = Math.min(1, matchedCount / 4) * 0.7 + Math.min(1, totalMatched / 10) * 0.3

  return {
    fields, unknown, confidence,
    matchedCount: totalMatched,
    isListing: matchedCount >= 2 && totalMatched >= 3,
    raw,
  }
}

// ── Dédoublonnage ────────────────────────────────────────────────────────────

/** Hash FNV-1a 64 bits en hexa — suffisant pour une clé de dédoublonnage, sans dépendance. */
export function hash64(str) {
  let h = 0xcbf29ce484222325n
  const p = 0x100000001b3n
  for (let i = 0; i < str.length; i++) { h ^= BigInt(str.charCodeAt(i)); h = (h * p) & 0xffffffffffffffffn }
  return h.toString(16).padStart(16, '0')
}

/**
 * Clé stable qui identifie *la même fille* repostée dans plusieurs salons.
 * Priorité au listing_id quand le salon en fournit un ; sinon empreinte des
 * caractéristiques (elles ne changent pas d'un repost à l'autre) ; sinon le
 * texte normalisé. Les photos sont ajoutées par le worker quand il les a.
 */
export function dedupeKey(fields, raw, photoHashes = []) {
  if (fields.listing_id) return 'lid:' + hash64(String(fields.listing_id).toLowerCase())
  const sig = [
    fields.age ?? '',
    normLabel(fields.origin ?? ''),
    fields.price?.amount ?? '',
    fields.salary?.amount ?? '',
    fields.english_level ?? '',
  ].join('|')
  if (sig.replace(/\|/g, '').length >= 4) return 'sig:' + hash64(sig + '|' + photoHashes.slice(0, 1).join(''))
  return 'raw:' + hash64(normLabel(raw).slice(0, 400))
}
