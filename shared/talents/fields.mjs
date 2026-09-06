// Dictionnaire de champs des annonces de marketplace de modèles (Telegram).
//
// Une annonce est du texte libre mais très régulier : une ligne = un emoji,
// un libellé, deux-points, une valeur. Chaque salon écrit ses libellés à sa
// façon (anglais, espagnol, français, abréviations) : on mappe donc tous les
// libellés rencontrés vers un champ canonique unique, puis on normalise la
// valeur selon le type du champ.
//
// Ajouter le support d'un nouveau salon = ajouter des alias ici. Aucune autre
// modification n'est nécessaire.

/** @typedef {'text'|'int'|'money'|'bool'|'list'|'hours'|'handle'|'country'} FieldType */

/**
 * Champs canoniques. `aliases` est comparé au libellé normalisé
 * (minuscules, sans accents, sans emoji, sans ponctuation finale).
 * @type {{key: string, type: FieldType, label: string, aliases: string[]}[]}
 */
export const FIELDS = [
  { key: 'listing_id', type: 'text', label: 'Réf. annonce', aliases: ['listing id', 'listing', 'ref', 'reference', 'id', 'model id', 'contract id', 'codigo'] },
  { key: 'name', type: 'text', label: 'Nom', aliases: ['name', 'model name', 'nombre', 'nom', 'alias', 'pseudo'] },
  { key: 'age', type: 'int', label: 'Âge', aliases: ['age', 'edad', 'years old', 'anos'] },
  { key: 'origin', type: 'country', label: 'Origine', aliases: ['origin', 'country', 'nationality', 'from', 'pais', 'origen', 'nacionalidad', 'pays', 'origine', 'location', 'based in'] },
  { key: 'salary', type: 'money', label: 'Salaire demandé', aliases: ['salary range', 'salary', 'expected salary', 'salario', 'sueldo', 'salaire', 'pay', 'monthly', 'monthly pay', 'rate'] },
  { key: 'english_level', type: 'int', label: 'Niveau anglais', aliases: ['english level', 'english', 'nivel de ingles', 'ingles', 'anglais', 'language level'] },
  { key: 'hours_per_day', type: 'hours', label: 'Heures / jour', aliases: ['time per day', 'hours per day', 'hours', 'availability', 'horas por dia', 'disponibilite', 'work hours', 'time'] },
  { key: 'content_types', type: 'list', label: 'Type de contenu', aliases: ['content type', 'content', 'content types', 'tipo de contenido', 'contenido', 'type de contenu', 'niche', 'limits'] },
  { key: 'device', type: 'text', label: 'Téléphone', aliases: ['smartphone', 'phone', 'device', 'telefono', 'movil', 'telephone', 'camera'] },
  { key: 'account_access', type: 'bool', label: 'Accès comptes', aliases: ['account access', 'gives access', 'access', 'acceso', 'acces au compte'] },
  { key: 'social_media', type: 'text', label: 'Réseaux', aliases: ['social media', 'socials', 'redes sociales', 'reseaux', 'accounts'] },
  { key: 'reels', type: 'bool', label: 'TikTok / Reels', aliases: ['tiktok/ig reels', 'tiktok ig reels', 'reels', 'tiktok', 'short form', 'tiktok reels'] },
  { key: 'onlyfans', type: 'bool', label: 'OnlyFans', aliases: ['onlyfans', 'of', 'fansly', 'has onlyfans', 'plateforme'] },
  { key: 'payment', type: 'list', label: 'Paiement', aliases: ['skrill', 'payment', 'payment method', 'payments', 'paypal', 'wise', 'crypto', 'metodo de pago', 'paiement'] },
  { key: 'with_agency', type: 'bool', label: 'Déjà en agence', aliases: ['is currently working with an agency', 'currently working with an agency', 'working with an agency', 'with agency', 'agency', 'en agencia', 'deja en agence'] },
  { key: 'can_start', type: 'text', label: 'Disponible', aliases: ['can start', 'start date', 'availability date', 'puede empezar', 'disponible', 'starts'] },
  { key: 'blocked_countries', type: 'list', label: 'Pays bloqués', aliases: ['blocked countries', 'geoblock', 'geo block', 'blocked', 'paises bloqueados', 'pays bloques', 'restrictions'] },
  { key: 'additional_info', type: 'text', label: 'Infos', aliases: ['additional info', 'additional information', 'info', 'notes', 'extra', 'informacion adicional', 'infos', 'description', 'details'] },
  { key: 'price', type: 'money', label: 'Prix du contrat', aliases: ['price', 'contract price', 'precio', 'prix', 'cost', 'fee'] },
  { key: 'warranty', type: 'int', label: 'Garantie (j)', aliases: ['warranty', 'guarantee', 'garantia', 'garantie', 'warranty days'] },
  { key: 'middleman', type: 'handle', label: 'Intermédiaire', aliases: ['middleman', 'mm', 'escrow', 'intermediario', 'intermediaire', 'contact', 'seller', 'vendor'] },
]

/** Index alias → champ, construit une fois. */
export const ALIAS_INDEX = (() => {
  /** @type {Map<string, typeof FIELDS[number]>} */
  const m = new Map()
  for (const f of FIELDS) {
    m.set(f.key.replace(/_/g, ' '), f)
    for (const a of f.aliases) m.set(a, f)
  }
  return m
})()

/** Champs qui suffisent, à eux seuls, à dire « c'est bien une annonce de modèle ». */
export const SIGNAL_FIELDS = ['age', 'origin', 'price', 'salary', 'english_level', 'onlyfans', 'listing_id']

/** Libellés qui ouvrent une section sans valeur (« Details: », « Additional Info: »). */
export const SECTION_LABELS = ['details', 'additional info', 'additional information', 'informacion adicional', 'infos', 'notes']
