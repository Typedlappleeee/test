// Trace des publications, pour la page Activité.
//
// Le registre des runs (`runStore`) vit en mémoire et s'efface six secondes
// après la fin : c'est un indicateur de progression, pas un historique. Sans
// écriture en base, un posting lancé depuis Publication ne laisse donc aucune
// trace — la page Activité lit `post_runs` et `scheduled_posts`, et seule la
// seconde est alimentée, par les tâches programmées.
//
// Ce module comble ce trou. Il est délibérément « best-effort » : un run ne
// doit jamais échouer parce que son enregistrement a échoué.
import { supabase } from './supabase'

export interface RunOutcome {
  /** Compte ciblé, tel qu'affiché dans le journal du run. */
  account: string
  ok: boolean
  /** Message d'erreur de GeeLark, le cas échéant. */
  error?: string
  /** Contenu publié (titre de la vidéo, nom de l'image…). */
  item?: string
}

export interface RecordRunInput {
  type: string                // 'reels' | 'story' | 'cross' | 'tiktok'…
  total: number
  ok: number
  err: number
  outcomes?: RunOutcome[]
  userId: string
  orgId?: string | null
  caption?: string | null
}

/**
 * Enregistre un run terminé dans `post_runs`.
 *
 * Le détail par compte est tenté dans une colonne `result`, comme le fait
 * `scheduled_posts`. Si la table ne l'a pas, l'insertion est rejouée sans —
 * le run reste visible dans l'historique, seul le détail manque.
 *
 * @returns null si tout s'est bien passé, sinon le message d'erreur.
 */
export async function recordRun(input: RecordRunInput): Promise<string | null> {
  const base: Record<string, unknown> = {
    type: input.type,
    total: input.total,
    ok_count: input.ok,
    err_count: input.err,
    user_id: input.userId,
    org_id: input.orgId ?? null,
  }
  const rich = {
    ...base,
    result: {
      caption: input.caption ?? null,
      outcomes: input.outcomes ?? [],
    },
  }

  try {
    const first = await supabase.from('post_runs').insert(rich)
    if (!first.error) return null

    // 42703 = colonne inexistante (PostgREST la nomme dans le message).
    const missingColumn = first.error.code === '42703' || /column .* does not exist|'result'/i.test(first.error.message)
    if (!missingColumn) return first.error.message

    const retry = await supabase.from('post_runs').insert(base)
    return retry.error ? retry.error.message : null
  } catch (e) {
    return e instanceof Error ? e.message : 'Erreur inconnue'
  }
}
