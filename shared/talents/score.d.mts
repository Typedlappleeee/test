import type { ParsedFields } from './parse.mjs'

export interface TalentPrefs {
  max_price: number | null; min_age: number | null; max_age: number | null
  min_english: number | null; min_hours: number | null
  blocked_countries: string[]; require_onlyfans: boolean
  exclude_with_agency: boolean; require_account_access: boolean
}

export interface TalentModel {
  matched: Map<string, number>; passed: Map<string, number>
  nM: number; nP: number; total: number
}

export interface TalentScore {
  ready: boolean
  score: number | null
  prob: number | null
  top: { feature: string; weight: number }[]
}

export declare const DEFAULT_PREFS: TalentPrefs
export declare const MIN_DECISIONS: number
export function hardFilter(fields: ParsedFields, prefs: Partial<TalentPrefs> | null | undefined): string[]
export function featuresOf(fields: ParsedFields): string[]
export function trainModel(decisions: { fields: ParsedFields; decision: string }[]): TalentModel
export function scoreListing(fields: ParsedFields, model: TalentModel | null): TalentScore
export function explainFeature(feature: string): string
