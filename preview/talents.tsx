// Prévisualisation hors-ligne de l'écran Talents.
//
//   npm run preview:talents   → http://localhost:5274/preview/talents.html
//
// Aucun Supabase, aucun Telegram : un jeu d'annonces fabriquées passe par le
// VRAI parseur, les VRAIS filtres et le VRAI scoring. C'est donc une démo du
// comportement réel, pas une maquette — utile pour régler le design des cartes
// ou éprouver le parseur sur un nouveau format de salon (colle ton message
// dans SAMPLES ci-dessous et recharge).
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { themeFor } from '@/lib/theme'
import { TalentsView } from '@/pages/Talents'
import {
  parseListing, dedupeKey, hardFilter, trainModel, scoreListing, DEFAULT_PREFS, MIN_DECISIONS,
  type TalentListing, type TalentFavorite, type TalentSalon, type TalentPrefs,
  type Decision, type Stage, type TalentsState,
} from '@/lib/talents'

const SALONS = ['OF Market · Modèles', 'Models Marketplace ES', 'Talent Hub 🇨🇴']

const COUNTRIES = ['Chile', 'Colombia', 'Argentina', 'Brazil', 'Mexico', 'Venezuela', 'Peru', 'Spain', 'Poland', 'Romania']
const CONTENT = ['Explicit content, masturbation, dildo and fingers', 'Softcore, lingerie, teasing', 'Explicit content, toys, roleplay', 'Solo content only']

/** Génère une annonce au format d'un vrai salon, puis la fait passer au parseur. */
function makeListing(i: number): TalentListing {
  const age = 19 + (i * 5) % 15
  const country = COUNTRIES[i % COUNTRIES.length]
  const price = 400 + ((i * 317) % 2200)
  const salary = 600 + ((i * 211) % 1800)
  const en = 1 + (i % 5)
  const hours = 2 + (i % 7)
  const text = `🌟 Model Listing 🌟

📋 Listing ID #${8200 + i}

🎂 Age: ${age}
🌍 Origin: ${country}
💰 Salary Range: ${salary} + increases

📝 Details:
🗣 English Level: ${en}
⏰ Time per Day: ${hours}hs
🎬 Content Type: ${CONTENT[i % CONTENT.length]}
📱 Smartphone: iPhone ${11 + (i % 4)}
🔐 Account Access: ${i % 3 === 0 ? 'Yes' : 'No'}
📲 Social Media: New accounts
🎞 TikTok/IG Reels: ${i % 4 === 0 ? 'No' : 'Yes'}
🌐 OnlyFans: ${i % 5 === 0 ? 'No' : 'Yes'}
💳 Skrill: Yes
🏢 Is currently working with an agency?: ${i % 6 === 0 ? 'Yes' : 'No'}
🚀 Can Start: ${i % 2 ? 'ASAP' : 'Next week'}
🚫 Blocked Countries: ${country}

ℹ️ Additional Info:
Professional model available

💰 Price: $${price}.00
✅ Warranty: ${3 + (i % 12)}
🧑 Middleman: @mm_${['henri77', 'lucas', 'sofia_mm', 'deal_broker'][i % 4]}`

  const parsed = parseListing(text)
  const prefs = DEMO_PREFS
  const reasons = hardFilter(parsed.fields, prefs)
  return {
    id: 'demo-' + i,
    org_id: 'demo',
    salon_id: 'salon-' + (i % SALONS.length),
    tg_message_id: 1000 + i,
    listing_id: String(8200 + i),
    posted_at: new Date(Date.now() - i * 47 * 60000).toISOString(),
    raw_text: text,
    fields: parsed.fields,
    // Photos absentes en démo : la carte gère explicitement ce cas.
    photos: [],
    parse_confidence: parsed.confidence,
    status: reasons.length ? 'filtered' : 'inbox',
    filter_reasons: reasons,
    dedupe_key: dedupeKey(parsed.fields, text),
    seen_in: i % 9 === 0 ? [{ salon: SALONS[0], at: '' }, { salon: SALONS[1], at: '' }] : [{ salon: SALONS[i % 3], at: '' }],
  }
}

// Assez d'annonces pour dépasser le seuil d'apprentissage (20 décisions) en une
// session, et des filtres qui n'en écartent qu'une minorité — sinon on ne voit
// jamais le score d'affinité s'activer en démo.
const DEMO_PREFS: TalentPrefs = { ...DEFAULT_PREFS, max_price: 2400, blocked_countries: ['Poland'] }
const ALL = Array.from({ length: 48 }, (_, i) => makeListing(i))

function Preview() {
  const theme = themeFor('geelark')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [stages, setStages] = useState<Record<string, Stage>>({})
  const [prefs, setPrefs] = useState<TalentPrefs>(DEMO_PREFS)
  const [history, setHistory] = useState<{ listing: TalentListing; decision: Decision }[]>([])

  const model = useMemo(() => trainModel(
    Object.entries(decisions)
      .map(([id, decision]) => ({ fields: ALL.find(l => l.id === id)!.fields, decision })),
  ), [decisions])

  const deck = useMemo(() => {
    const open = ALL.filter(l => l.status === 'inbox' && decisions[l.id] !== 'match' && decisions[l.id] !== 'pass')
    if (model.total < MIN_DECISIONS) return open
    return [...open].sort((a, b) => (scoreListing(b.fields, model).score ?? 0) - (scoreListing(a.fields, model).score ?? 0))
  }, [decisions, model])

  const favorites: TalentFavorite[] = useMemo(() =>
    Object.entries(decisions).filter(([, d]) => d === 'match').map(([id]) => ({
      listing_id: id, org_id: 'demo', stage: stages[id] ?? 'new',
      owner_id: null, tags: [], note: null, matched_at: new Date().toISOString(),
      listing: ALL.find(l => l.id === id),
    })), [decisions, stages])

  const salons: TalentSalon[] = SALONS.map((title, i) => ({
    id: 'salon-' + i, org_id: 'demo', tg_chat_id: '-100' + (1000 + i), title,
    username: i === 0 ? 'ofmarket_models' : null, kind: 'channel', active: i !== 2,
    created_at: '', last_seen_at: new Date(Date.now() - i * 3600_000).toISOString(),
    last_error: i === 2 ? 'Salon introuvable : ton compte n’est pas membre' : null,
    listing_count: ALL.filter(l => l.salon_id === 'salon-' + i).length,
  }))

  const noop = async () => {}
  const t: TalentsState = {
    loading: false, error: null,
    deck, filtered: ALL.filter(l => l.status === 'filtered'), review: [],
    favorites, salons, prefs,
    decisionCount: model.total,
    modelReady: model.total >= MIN_DECISIONS,
    scoreOf: l => scoreListing(l.fields, model),
    decide: async (l, d) => {
      setDecisions(m => ({ ...m, [l.id]: d }))
      setHistory(h => [...h, { listing: l, decision: d }])
    },
    undo: async () => {
      const last = history[history.length - 1]
      if (!last) return null
      setHistory(h => h.slice(0, -1))
      setDecisions(m => { const n = { ...m }; delete n[last.listing.id]; return n })
      return last.listing
    },
    lastDecision: history[history.length - 1] ?? null,
    setStage: async (id, stage) => setStages(s => ({ ...s, [id]: stage })),
    setNote: noop,
    addSalon: noop, toggleSalon: noop, removeSalon: noop,
    savePrefs: async p => setPrefs(p),
    reload: () => {},
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.appBg, color: '#E4E4E7', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{
        padding: '8px 26px', fontSize: 11.5, color: '#FBBF24',
        background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)',
      }}>
        Prévisualisation hors-ligne · {ALL.length} annonces fabriquées, passées par le vrai parseur et le vrai scoring. Aucune donnée réelle.
      </div>
      <TalentsView theme={theme} t={t} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
