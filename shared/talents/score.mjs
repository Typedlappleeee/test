// Tri automatique des annonces : filtres durs + score appris sur tes swipes.
//
// Deux mécanismes distincts, volontairement séparés :
//
//   1. Les FILTRES DURS sont tes règles explicites (budget max, âge, pays
//      bloqués…). Une annonce qui les viole n'entre jamais dans le deck : elle
//      est rangée en « filtrées » avec la raison, consultable mais hors du flux.
//
//   2. Le SCORE est appris de tes décisions passées (Bayes naïf lissé). Il ne
//      supprime rien : il ordonne le deck pour que tes meilleures annonces
//      passent en premier. Sous 20 décisions il ne se déclenche pas — un
//      modèle entraîné sur 5 swipes ne vaut rien et donnerait un faux
//      sentiment de tri.

// ── 1. Filtres durs ──────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   max_price?: number|null, min_age?: number|null, max_age?: number|null,
 *   min_english?: number|null, min_hours?: number|null,
 *   blocked_countries?: string[], require_onlyfans?: boolean,
 *   exclude_with_agency?: boolean, require_account_access?: boolean,
 * }} TalentPrefs
 */

export const DEFAULT_PREFS = {
  max_price: null, min_age: 18, max_age: null,
  min_english: null, min_hours: null,
  blocked_countries: [], require_onlyfans: false,
  exclude_with_agency: false, require_account_access: false,
}

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * @returns {string[]} les raisons de rejet — vide = l'annonce passe.
 */
export function hardFilter(fields, prefs) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) }
  const out = []
  const price = fields.price?.amount ?? null
  const salary = fields.salary?.amount ?? null

  if (p.max_price != null && price != null && price > p.max_price) out.push(`Prix ${price} > budget ${p.max_price}`)
  if (p.min_age != null && fields.age != null && fields.age < p.min_age) out.push(`Âge ${fields.age} < ${p.min_age}`)
  if (p.max_age != null && fields.age != null && fields.age > p.max_age) out.push(`Âge ${fields.age} > ${p.max_age}`)
  if (p.min_english != null && fields.english_level != null && fields.english_level < p.min_english) out.push(`Anglais ${fields.english_level} < ${p.min_english}`)
  if (p.min_hours != null && fields.hours_per_day?.hours != null && fields.hours_per_day.hours < p.min_hours) out.push(`${fields.hours_per_day.hours} h/j < ${p.min_hours}`)
  if (p.require_onlyfans && fields.onlyfans === false) out.push('Pas de compte OnlyFans')
  if (p.exclude_with_agency && fields.with_agency === true) out.push('Déjà sous contrat en agence')
  if (p.require_account_access && fields.account_access === false) out.push('Ne donne pas accès aux comptes')
  if (p.blocked_countries?.length && fields.origin) {
    const o = norm(fields.origin)
    if (p.blocked_countries.some(c => o.includes(norm(c)))) out.push(`Origine exclue : ${fields.origin}`)
  }
  // Le salaire demandé compte aussi dans le budget quand il dépasse le prix.
  if (p.max_price != null && salary != null && price == null && salary > p.max_price) out.push(`Salaire ${salary} > budget ${p.max_price}`)
  return out
}

// ── 2. Score appris ──────────────────────────────────────────────────────────

const PRICE_BUCKETS = [0, 300, 600, 1000, 1500, 2500, Infinity]
const bucket = (n, arr) => { for (let i = 1; i < arr.length; i++) if (n < arr[i]) return `${arr[i - 1]}-${arr[i]}`; return 'max' }

/**
 * Une annonce → un sac de traits discrets. Le modèle n'apprend que là-dessus :
 * peu de traits, chacun lisible, donc explicable en clair dans l'UI.
 */
export function featuresOf(fields) {
  const f = []
  if (fields.origin) f.push('origin=' + norm(fields.origin))
  if (fields.price?.amount != null) f.push('price=' + bucket(fields.price.amount, PRICE_BUCKETS))
  if (fields.salary?.amount != null) f.push('salary=' + bucket(fields.salary.amount, PRICE_BUCKETS))
  if (fields.age != null) f.push('age=' + (fields.age < 21 ? '18-20' : fields.age < 25 ? '21-24' : fields.age < 30 ? '25-29' : '30+'))
  if (fields.english_level != null) f.push('en=' + fields.english_level)
  if (fields.hours_per_day?.hours != null) f.push('hours=' + (fields.hours_per_day.hours < 3 ? 'low' : fields.hours_per_day.hours < 6 ? 'mid' : 'high'))
  if (fields.onlyfans != null) f.push('of=' + fields.onlyfans)
  if (fields.with_agency != null) f.push('agency=' + fields.with_agency)
  if (fields.account_access != null) f.push('access=' + fields.account_access)
  if (fields.reels != null) f.push('reels=' + fields.reels)
  for (const c of (fields.content_types || []).slice(0, 6)) f.push('content=' + norm(c))
  for (const c of (fields.payment || []).slice(0, 4)) f.push('pay=' + norm(c))
  return f
}

/** Décisions passées → modèle. `decisions = [{ fields, decision }]`. */
export function trainModel(decisions) {
  const matched = new Map(), passed = new Map()
  let nM = 0, nP = 0
  for (const d of decisions) {
    if (d.decision !== 'match' && d.decision !== 'pass') continue
    const target = d.decision === 'match' ? matched : passed
    if (d.decision === 'match') nM++; else nP++
    for (const f of new Set(featuresOf(d.fields || {}))) target.set(f, (target.get(f) || 0) + 1)
  }
  return { matched, passed, nM, nP, total: nM + nP }
}

export const MIN_DECISIONS = 20

/**
 * Probabilité que tu matches cette annonce + les traits qui pèsent le plus.
 * Bayes naïf, lissage de Laplace α=1. `ready:false` tant que le modèle n'a pas
 * assez vu : on n'affiche alors aucun score plutôt qu'un score bidon.
 */
export function scoreListing(fields, model) {
  if (!model || model.total < MIN_DECISIONS || model.nM === 0 || model.nP === 0) {
    return { ready: false, score: null, prob: null, top: [] }
  }
  const a = 1
  let logit = Math.log((model.nM + a) / (model.nP + a))
  const contribs = []
  for (const f of new Set(featuresOf(fields))) {
    const pM = ((model.matched.get(f) || 0) + a) / (model.nM + 2 * a)
    const pP = ((model.passed.get(f) || 0) + a) / (model.nP + 2 * a)
    const w = Math.log(pM / pP)
    logit += w
    if (Math.abs(w) > 0.15) contribs.push({ feature: f, weight: w })
  }
  contribs.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight))
  const prob = 1 / (1 + Math.exp(-logit))
  return { ready: true, score: Math.round(prob * 100), prob, top: contribs.slice(0, 3) }
}

/** Traduction lisible d'un trait, pour expliquer le score dans l'UI. */
export function explainFeature(f) {
  const [k, v] = String(f).split('=')
  const L = {
    origin: 'Origine', price: 'Prix', salary: 'Salaire', age: 'Âge', en: 'Anglais',
    hours: 'Heures/j', of: 'OnlyFans', agency: 'En agence', access: 'Accès comptes',
    reels: 'Reels', content: 'Contenu', pay: 'Paiement',
  }[k] || k
  const V = v === 'true' ? 'oui' : v === 'false' ? 'non' : v === 'low' ? 'peu' : v === 'mid' ? 'moyen' : v === 'high' ? 'élevé' : v
  return `${L} · ${V}`
}
