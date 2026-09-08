// Lecture des photos : ce que l'annonce montre, en plus de ce qu'elle dit.
//
// Un modèle CLIP tourne EN LOCAL, sur ta machine. Aucune photo ne part vers un
// service tiers. Le modèle (~90 Mo) se télécharge une seule fois au premier
// lancement, puis tout fonctionne hors ligne.
//
// ── Ce que ça vaut, sans enjoliver ───────────────────────────────────────────
// CLIP compare une image à des descriptions et dit laquelle colle le mieux. Il
// est bon sur ce qui est net et binaire — des tatouages visibles, une couleur de
// cheveux. Il est nettement moins fiable sur la morphologie : « forte poitrine »
// n'a pas de définition qu'un modèle sache trancher de façon stable, et le
// résultat dépend du cadrage, de la pose, du vêtement.
//
// D'où deux règles de conception :
//   1. chaque attribut porte son niveau de confiance, affiché dans l'interface ;
//   2. en dessous d'un seuil, l'attribut est marqué incertain et n'est pas
//      utilisé pour filtrer.
// Un filtre visuel n'efface jamais une annonce : elle part dans « Écartées »
// avec sa raison, et se remet à trier d'un clic.

let pipe = null
let loading = null

/** Groupes d'attributs. Les descriptions d'un même groupe s'excluent. */
export const ATTRIBUTES = [
  {
    key: 'tattoos', label: 'Tatouages', threshold: 0.60,
    options: [
      { v: 'yes', label: 'Tatouée',    prompt: 'a photo of a woman with visible tattoos on her skin' },
      { v: 'no',  label: 'Sans tatou', prompt: 'a photo of a woman with bare skin and no tattoos' },
    ],
  },
  {
    key: 'build', label: 'Silhouette', threshold: 0.55,
    options: [
      { v: 'curvy',    label: 'Formes généreuses', prompt: 'a photo of a curvy voluptuous woman with wide hips' },
      { v: 'slim',     label: 'Mince',             prompt: 'a photo of a slim slender thin woman' },
      { v: 'athletic', label: 'Athlétique',        prompt: 'a photo of an athletic fit toned woman' },
    ],
  },
  {
    key: 'chest', label: 'Poitrine', threshold: 0.62,
    options: [
      { v: 'large', label: 'Forte poitrine',  prompt: 'a photo of a woman with a large full bust' },
      { v: 'small', label: 'Petite poitrine', prompt: 'a photo of a woman with a small flat bust' },
    ],
  },
  {
    key: 'glutes', label: 'Hanches', threshold: 0.62,
    options: [
      { v: 'large', label: 'Hanches marquées', prompt: 'a photo of a woman with large round buttocks and wide hips' },
      { v: 'small', label: 'Hanches fines',    prompt: 'a photo of a woman with small narrow hips' },
    ],
  },
  {
    key: 'hair', label: 'Cheveux', threshold: 0.45,
    options: [
      { v: 'blonde',  label: 'Blonde',  prompt: 'a photo of a woman with blonde hair' },
      { v: 'brown',   label: 'Brune',   prompt: 'a photo of a woman with brown hair' },
      { v: 'black',   label: 'Cheveux noirs', prompt: 'a photo of a woman with black hair' },
      { v: 'red',     label: 'Rousse',  prompt: 'a photo of a woman with red ginger hair' },
    ],
  },
  {
    key: 'piercings', label: 'Piercings', threshold: 0.62,
    options: [
      { v: 'yes', label: 'Piercings',     prompt: 'a photo of a woman with visible facial piercings' },
      { v: 'no',  label: 'Sans piercing', prompt: 'a photo of a woman without any facial piercing' },
    ],
  },
  {
    key: 'shot', label: 'Type de photo', threshold: 0.45,
    options: [
      { v: 'mirror',  label: 'Selfie miroir',  prompt: 'a mirror selfie taken with a phone' },
      { v: 'studio',  label: 'Photo pro',      prompt: 'a professional studio portrait photograph' },
      { v: 'outdoor', label: 'Extérieur',      prompt: 'an outdoor photo taken outside' },
      { v: 'indoor',  label: 'Intérieur',      prompt: 'a casual indoor photo taken at home' },
    ],
  },
]

/**
 * Garde-fou indispensable : CLIP choisit toujours la description la « moins
 * fausse », même quand la question n'a pas de sens pour l'image. Sur une
 * bannière de salon ou une capture de tarifs — courantes dans ces canaux — il
 * répondrait quand même « tatouée » avec assurance. On vérifie donc d'abord
 * qu'il s'agit bien d'une photo de personne, et on n'attribue rien sinon.
 */
const SUBJECT = {
  key: 'subject', threshold: 0.55,
  options: [
    { v: 'person', prompt: 'a photograph of a person, a human being' },
    { v: 'other',  prompt: 'a picture of text, a logo, a banner or a screenshot' },
    { v: 'scene',  prompt: 'a photo of an object, a landscape or an empty room' },
  ],
}

const ALL_PROMPTS = [...SUBJECT.options.map(o => o.prompt), ...ATTRIBUTES.flatMap(a => a.options.map(o => o.prompt))]

/** Score renormalisé à l'intérieur d'un groupe de descriptions concurrentes. */
function within(group, byPrompt) {
  const raw = group.options.map(o => ({ o, s: byPrompt.get(o.prompt) ?? 0 }))
  const sum = raw.reduce((a, r) => a + r.s, 0) || 1
  return raw.map(r => ({ ...r, s: r.s / sum })).sort((a, b) => b.s - a.s)[0]
}

/** Charge CLIP à la demande. Une seule fois, partagé par tous les appels. */
async function load(log = console.log) {
  if (pipe) return pipe
  if (loading) return loading
  loading = (async () => {
    let transformers
    try {
      transformers = await import('@huggingface/transformers')
    } catch {
      throw new Error(
        'La lecture des photos demande @huggingface/transformers.\n'
        + '  Installe-le une fois : npm install @huggingface/transformers')
    }
    log('chargement du modèle de vision (première fois : ~90 Mo à télécharger)…')
    const t0 = Date.now()
    pipe = await transformers.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' })
    pipe.RawImage = transformers.RawImage
    log(`modèle prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s.`)
    return pipe
  })()
  return loading
}

/**
 * Analyse une image et rend un attribut par groupe.
 * @returns {Promise<Record<string, {value:string,label:string,score:number,sure:boolean}>>}
 */
async function analyzeOne(path, log) {
  const p = await load(log)
  const img = await p.RawImage.read(path)
  // Une seule passe pour tous les prompts : CLIP encode l'image une fois.
  const out = await p(img, ALL_PROMPTS)
  const byPrompt = new Map(out.map(o => [o.label, o.score]))

  const subject = within(SUBJECT, byPrompt)
  if (subject.o.v !== 'person' || subject.s < SUBJECT.threshold) {
    return { subject: subject.o.v, subjectScore: Number(subject.s.toFixed(3)) }
  }

  // Renormaliser dans chaque groupe : les scores CLIP sont répartis sur TOUS les
  // prompts, donc bruts ils ne disent rien de la comparaison qui nous intéresse
  // (« tatouée ou non »), seulement de celle-ci parmi vingt autres.
  const res = { subject: 'person', subjectScore: Number(subject.s.toFixed(3)) }
  for (const attr of ATTRIBUTES) {
    const best = within(attr, byPrompt)
    res[attr.key] = {
      value: best.o.v, label: best.o.label,
      score: Number(best.s.toFixed(3)),
      sure: best.s >= attr.threshold,
    }
  }
  return res
}

/**
 * Analyse les photos d'une annonce. Plusieurs photos sont moyennées : une pose
 * ou un cadrage isolé induit le modèle en erreur, l'accord entre plusieurs
 * prises est un signal nettement plus solide.
 */
export async function analyzeListing(photoPaths, log = console.log) {
  const paths = photoPaths.slice(0, 3)
  if (!paths.length) return null
  const all = []
  for (const path of paths) {
    try { all.push(await analyzeOne(path, log)) }
    catch (e) { log('  photo illisible (' + path + ') : ' + e.message) }
  }
  if (!all.length) return null

  // On n'attribue rien à partir de photos qui ne montrent personne.
  const runs = all.filter(r => r.subject === 'person')
  if (!runs.length) {
    return { subject: all[0].subject, photos: all.length, at: Date.now(), model: 'clip-vit-base-patch32' }
  }

  const merged = {}
  for (const attr of ATTRIBUTES) {
    // Vote pondéré par la confiance de chaque prise.
    const tally = new Map()
    for (const r of runs) {
      const a = r[attr.key]
      const prev = tally.get(a.value) ?? { n: 0, sum: 0, label: a.label }
      tally.set(a.value, { n: prev.n + 1, sum: prev.sum + a.score, label: a.label })
    }
    const [value, agg] = [...tally.entries()].sort((a, b) => b[1].sum - a[1].sum)[0]
    const score = agg.sum / runs.length
    merged[attr.key] = {
      value, label: agg.label,
      score: Number(score.toFixed(3)),
      sure: score >= attr.threshold && agg.n === runs.length,   // toutes les prises d'accord
      seen: runs.length,
    }
  }
  return { ...merged, subject: 'person', photos: runs.length, at: Date.now(), model: 'clip-vit-base-patch32' }
}

/** Les filtres visuels de l'utilisateur, appliqués à une analyse. */
export function visionFilter(vision, prefs) {
  const out = []
  if (!prefs?.vision) return out
  if (vision && vision.subject !== 'person') return out   // rien de lisible sur la photo
  for (const [key, want] of Object.entries(prefs.vision)) {
    if (!want || want === 'any') continue
    const attr = ATTRIBUTES.find(a => a.key === key)
    const got = vision?.[key]
    // Sans analyse ou sans certitude, on ne rejette pas : un signal incertain
    // n'a pas à faire disparaître une annonce.
    if (!attr || !got || !got.sure) continue
    if (got.value !== want) {
      const wanted = attr.options.find(o => o.v === want)
      out.push(`${attr.label} : ${got.label} (voulu : ${wanted ? wanted.label : want})`)
    }
  }
  return out
}
