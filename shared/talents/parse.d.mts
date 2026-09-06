// Déclarations TypeScript pour le parseur partagé (implémenté en .mjs pour
// tourner à l'identique dans le worker Node et dans le bundle Vite).
export interface Money { amount: number | null; currency: string | null; raw: string }
export interface Hours { hours: number | null; raw: string }

export interface ParsedFields {
  listing_id?: string; name?: string; age?: number; origin?: string
  salary?: Money; price?: Money; english_level?: number; hours_per_day?: Hours
  content_types?: string[]; device?: string; account_access?: boolean
  social_media?: string; reels?: boolean; onlyfans?: boolean; payment?: string[]
  with_agency?: boolean; can_start?: string; blocked_countries?: string[]
  additional_info?: string; warranty?: number; middleman?: string
  [k: string]: unknown
}

export interface ParseResult {
  fields: ParsedFields
  unknown: Record<string, string>
  confidence: number
  matchedCount: number
  isListing: boolean
  raw: string
}

export function parseListing(text: string): ParseResult
export function dedupeKey(fields: ParsedFields, raw: string, photoHashes?: string[]): string
export function hash64(s: string): string
export function parseMoney(raw: string): Money
export function parseHours(raw: string): Hours
export function parseBool(raw: string): boolean | null
export function parseList(raw: string): string[]
export function stripEmoji(s: string): string
export function normLabel(s: string): string
