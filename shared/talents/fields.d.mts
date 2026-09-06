export type FieldType = 'text' | 'int' | 'money' | 'bool' | 'list' | 'hours' | 'handle' | 'country'
export interface FieldDef { key: string; type: FieldType; label: string; aliases: string[] }
export declare const FIELDS: FieldDef[]
export declare const ALIAS_INDEX: Map<string, FieldDef>
export declare const SIGNAL_FIELDS: string[]
export declare const SECTION_LABELS: string[]
