// Couche données de la page Talents.
//
// Le worker (worker-telegram/) écrit ; l'app lit et écrit uniquement les
// décisions et les réglages. Le parsing et le scoring sont dans shared/talents/
// pour que le worker et l'app en aient exactement la même version.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'
import { parseListing, dedupeKey } from '@shared/talents/parse.mjs'
import type { ParsedFields, Money } from '@shared/talents/parse.mjs'
import { hardFilter, trainModel, scoreListing, explainFeature, DEFAULT_PREFS, MIN_DECISIONS } from '@shared/talents/score.mjs'

export { explainFeature, DEFAULT_PREFS, MIN_DECISIONS, parseListing, dedupeKey, hardFilter, trainModel, scoreListing }

// ── Types ────────────────────────────────────────────────────────────────────
// Les champs d'une annonce sont définis une seule fois, avec le parseur partagé :
// dupliquer le type ici laisserait l'app et le worker diverger en silence.
export type { Money, Hours, ParsedFields } from '@shared/talents/parse.mjs'
export type TalentFields = ParsedFields

export interface TalentPhoto { path: string; url: string; hash: string }

export interface TalentListing {
  id: string; org_id: string; salon_id: string | null
  tg_message_id: number | null; listing_id: string | null
  posted_at: string; raw_text: string
  fields: TalentFields; photos: TalentPhoto[]
  parse_confidence: number
  status: 'inbox' | 'filtered' | 'review'
  filter_reasons: string[]
  dedupe_key: string
  seen_in: { salon: string; at: string }[]
}

export interface TalentSalon {
  id: string; org_id: string; tg_chat_id: string; title: string
  username: string | null; kind: string; active: boolean
  created_at: string; last_seen_at: string | null; last_error: string | null
  listing_count: number
}

export type Decision = 'match' | 'pass' | 'later'
export type Stage = 'new' | 'contacted' | 'negotiating' | 'signed' | 'lost'

export interface TalentFavorite {
  listing_id: string; org_id: string; stage: Stage
  owner_id: string | null; tags: string[]; note: string | null
  matched_at: string
  listing?: TalentListing
}

export interface TalentPrefs {
  max_price: number | null; min_age: number | null; max_age: number | null
  min_english: number | null; min_hours: number | null
  blocked_countries: string[]; require_onlyfans: boolean
  exclude_with_agency: boolean; require_account_access: boolean
}

export const STAGES: { k: Stage; label: string; tone: string }[] = [
  { k: 'new', label: 'À contacter', tone: '#22D3EE' },
  { k: 'contacted', label: 'Contactée', tone: '#A78BFA' },
  { k: 'negotiating', label: 'En négo', tone: '#FBBF24' },
  { k: 'signed', label: 'Signée', tone: '#34D399' },
  { k: 'lost', label: 'Perdue', tone: '#71717A' },
]

// ── Hook principal ───────────────────────────────────────────────────────────
export interface TalentsState {
  loading: boolean
  error: string | null
  deck: TalentListing[]            // à swiper, triées par score puis récence
  filtered: TalentListing[]        // écartées par les filtres durs
  review: TalentListing[]          // parsing douteux, à vérifier à la main
  favorites: TalentFavorite[]
  salons: TalentSalon[]
  prefs: TalentPrefs
  decisionCount: number
  modelReady: boolean
  scoreOf: (l: TalentListing) => { ready: boolean; score: number | null; top: { feature: string; weight: number }[] }
  decide: (l: TalentListing, d: Decision) => Promise<void>
  undo: () => Promise<TalentListing | null>
  lastDecision: { listing: TalentListing; decision: Decision } | null
  setStage: (listingId: string, stage: Stage) => Promise<void>
  setNote: (listingId: string, note: string) => Promise<void>
  addSalon: (s: { tg_chat_id: string; title: string; username?: string; kind?: string }) => Promise<void>
  toggleSalon: (id: string, active: boolean) => Promise<void>
  removeSalon: (id: string) => Promise<void>
  savePrefs: (p: TalentPrefs) => Promise<void>
  reload: () => void
}

export function useTalents(user: User, org: OrgState): TalentsState {
  const orgId = org.currentOrg?.id ?? null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [listings, setListings] = useState<TalentListing[]>([])
  const [favorites, setFavorites] = useState<TalentFavorite[]>([])
  const [salons, setSalons] = useState<TalentSalon[]>([])
  const [prefs, setPrefs] = useState<TalentPrefs>(DEFAULT_PREFS as TalentPrefs)
  const [myDecisions, setMyDecisions] = useState<Record<string, Decision>>({})
  const [history, setHistory] = useState<{ listing: TalentListing; decision: Decision }[]>([])
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const [ls, fa, sa, pr, de] = await Promise.all([
          supabase.from('talent_listings').select('*').eq('org_id', orgId).order('posted_at', { ascending: false }).limit(600),
          supabase.from('talent_favorites').select('*, listing:talent_listings(*)').eq('org_id', orgId).order('matched_at', { ascending: false }),
          supabase.from('talent_salons').select('*').eq('org_id', orgId).order('created_at'),
          supabase.from('talent_prefs').select('prefs').eq('org_id', orgId).maybeSingle(),
          supabase.from('talent_decisions').select('listing_id, decision').eq('org_id', orgId).eq('user_id', user.id),
        ])
        if (!alive) return
        const firstErr = [ls, fa, sa, de].find(r => r.error)?.error
        if (firstErr) throw firstErr
        setListings((ls.data ?? []) as TalentListing[])
        setFavorites((fa.data ?? []) as TalentFavorite[])
        setSalons((sa.data ?? []) as TalentSalon[])
        setPrefs({ ...(DEFAULT_PREFS as TalentPrefs), ...((pr.data?.prefs as Partial<TalentPrefs>) ?? {}) })
        const map: Record<string, Decision> = {}
        for (const d of de.data ?? []) map[d.listing_id as string] = d.decision as Decision
        setMyDecisions(map)
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [orgId, user.id, tick])

  // Le modèle est réentraîné à chaque swipe : quelques dizaines de lignes,
  // c'est instantané et le deck se réordonne sous tes yeux.
  const model = useMemo(() => {
    const decided: { fields: TalentFields; decision: Decision }[] = []
    for (const [id, decision] of Object.entries(myDecisions)) {
      const l = listings.find(x => x.id === id)
      if (l) decided.push({ fields: l.fields, decision })
    }
    return trainModel(decided)
  }, [myDecisions, listings])

  const scoreOf = useCallback((l: TalentListing) => scoreListing(l.fields, model), [model])

  const deck = useMemo(() => {
    const open = listings.filter(l => l.status === 'inbox' && myDecisions[l.id] !== 'match' && myDecisions[l.id] !== 'pass')
    if (model.total < MIN_DECISIONS) return open
    return [...open].sort((a, b) => (scoreListing(b.fields, model).score ?? 0) - (scoreListing(a.fields, model).score ?? 0))
  }, [listings, myDecisions, model])

  const filtered = useMemo(() => listings.filter(l => l.status === 'filtered'), [listings])
  const review = useMemo(() => listings.filter(l => l.status === 'review'), [listings])

  // ── Écritures ──────────────────────────────────────────────────────────────
  const decide = useCallback(async (l: TalentListing, d: Decision) => {
    if (!orgId) return
    setMyDecisions(m => ({ ...m, [l.id]: d }))
    setHistory(h => [...h.slice(-30), { listing: l, decision: d }])
    const { error: e } = await supabase.from('talent_decisions')
      .upsert({ org_id: orgId, listing_id: l.id, user_id: user.id, decision: d }, { onConflict: 'listing_id,user_id' })
    if (e) { setError(e.message); return }
    // Le trigger SQL crée/retire la ligne de favori : on relit pour l'onglet Favoris.
    if (d === 'match' || d === 'pass') {
      const { data } = await supabase.from('talent_favorites')
        .select('*, listing:talent_listings(*)').eq('org_id', orgId).order('matched_at', { ascending: false })
      setFavorites((data ?? []) as TalentFavorite[])
    }
  }, [orgId, user.id])

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || !orgId) return null
    setHistory(h => h.slice(0, -1))
    setMyDecisions(m => { const n = { ...m }; delete n[last.listing.id]; return n })
    await supabase.from('talent_decisions').delete().eq('listing_id', last.listing.id).eq('user_id', user.id)
    await supabase.from('talent_favorites').delete().eq('listing_id', last.listing.id).eq('stage', 'new')
    setFavorites(f => f.filter(x => x.listing_id !== last.listing.id))
    return last.listing
  }, [history, orgId, user.id])

  const setStage = useCallback(async (listingId: string, stage: Stage) => {
    setFavorites(f => f.map(x => x.listing_id === listingId ? { ...x, stage } : x))
    await supabase.from('talent_favorites').update({ stage, updated_at: new Date().toISOString() }).eq('listing_id', listingId)
  }, [])

  const setNote = useCallback(async (listingId: string, note: string) => {
    setFavorites(f => f.map(x => x.listing_id === listingId ? { ...x, note } : x))
    await supabase.from('talent_favorites').update({ note, updated_at: new Date().toISOString() }).eq('listing_id', listingId)
  }, [])

  const addSalon = useCallback(async (s: { tg_chat_id: string; title: string; username?: string; kind?: string }) => {
    if (!orgId) return
    const { data, error: e } = await supabase.from('talent_salons').insert({
      org_id: orgId, tg_chat_id: s.tg_chat_id, title: s.title,
      username: s.username || null, kind: s.kind || 'channel', added_by: user.id,
    }).select().single()
    if (e) { setError(e.message); return }
    setSalons(x => [...x, data as TalentSalon])
  }, [orgId, user.id])

  const toggleSalon = useCallback(async (id: string, active: boolean) => {
    setSalons(x => x.map(s => s.id === id ? { ...s, active } : s))
    await supabase.from('talent_salons').update({ active }).eq('id', id)
  }, [])

  const removeSalon = useCallback(async (id: string) => {
    setSalons(x => x.filter(s => s.id !== id))
    await supabase.from('talent_salons').delete().eq('id', id)
  }, [])

  const savePrefs = useCallback(async (p: TalentPrefs) => {
    if (!orgId) return
    setPrefs(p)
    await supabase.from('talent_prefs')
      .upsert({ org_id: orgId, prefs: p, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'org_id' })
  }, [orgId, user.id])

  return {
    loading, error, deck, filtered, review, favorites, salons, prefs,
    decisionCount: model.total,
    modelReady: model.total >= MIN_DECISIONS,
    scoreOf, decide, undo,
    lastDecision: history[history.length - 1] ?? null,
    setStage, setNote, addSalon, toggleSalon, removeSalon, savePrefs, reload,
  }
}

// ── Formatage ────────────────────────────────────────────────────────────────
export function fmtMoney(m: Money | undefined | null): string {
  if (!m) return '—'
  if (m.amount == null) return m.raw || '—'
  const sym = m.currency === 'EUR' ? '€' : m.currency === 'GBP' ? '£' : '$'
  return sym + m.amount.toLocaleString('fr-FR')
}

export function fmtAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return d < 30 ? `il y a ${d} j` : new Date(iso).toLocaleDateString('fr-FR')
}

export function titleOf(l: TalentListing): string {
  const f = l.fields
  if (f.name) return f.name
  const bits = [f.origin, f.age ? `${f.age} ans` : null].filter(Boolean)
  return bits.length ? bits.join(' · ') : (l.listing_id ? `Annonce #${l.listing_id}` : 'Annonce')
}

/**
 * Compteur léger pour le badge de navigation : une seule requête `count`,
 * sans charger les annonces. Le hook complet `useTalents` reste réservé à la page.
 */
export function useTalentInboxCount(user: User, org: OrgState): number | null {
  const orgId = org.currentOrg?.id ?? null
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!orgId) { setN(null); return }
    let alive = true
    ;(async () => {
      const [inbox, mine] = await Promise.all([
        supabase.from('talent_listings').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'inbox'),
        supabase.from('talent_decisions').select('id', { count: 'exact', head: true })
          .eq('org_id', orgId).eq('user_id', user.id).in('decision', ['match', 'pass']),
      ])
      if (!alive || inbox.error) return
      setN(Math.max(0, (inbox.count ?? 0) - (mine.count ?? 0)))
    })()
    return () => { alive = false }
  }, [orgId, user.id])
  return n
}
