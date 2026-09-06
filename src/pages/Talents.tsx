// Talents — le sourcing de modèles depuis les salons Telegram.
//
// Quatre onglets, un par étape du flux :
//   Deck     annonces à trancher, une carte à la fois (match / pass / plus tard)
//   Favoris  ce que tu as matché, avec un pipeline de recrutement
//   Salons   les canaux Telegram branchés, et l'état du worker d'ingestion
//   Filtres  les règles qui écartent une annonce avant même qu'elle t'atteigne
import { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { PageHead, Panel, PanelHead, Btn, Chip, Empty, Icon, Kpi, Modal } from '@/lib/ui'
import TalentCard from '@/components/TalentCard'
import {
  useTalents, fmtMoney, fmtAgo, titleOf, explainFeature, MIN_DECISIONS, STAGES,
  type TalentListing, type TalentPrefs, type Stage, type TalentsState,
} from '@/lib/talents'

type Tab = 'deck' | 'favorites' | 'salons' | 'filters'

export default function Talents({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  return <TalentsView theme={theme} t={useTalents(user, org)} />
}

/**
 * La vue pure, séparée de son chargement de données : elle ne dépend que d'un
 * `TalentsState`. C'est ce qui permet de l'ouvrir sans Supabase ni Telegram
 * (`npm run preview:talents`) et de la tester avec un état fabriqué.
 */
export function TalentsView({ theme, t }: { theme: Theme; t: TalentsState }) {
  const [tab, setTab] = useState<Tab>('deck')
  const [raw, setRaw] = useState<TalentListing | null>(null)

  const salonName = useMemo(() => {
    const m = new Map(t.salons.map(s => [s.id, s.title]))
    return (id: string | null) => (id ? m.get(id) : undefined)
  }, [t.salons])

  const TABS: { k: Tab; label: string; n?: number }[] = [
    { k: 'deck', label: 'À trier', n: t.deck.length },
    { k: 'favorites', label: 'Favoris', n: t.favorites.length },
    { k: 'salons', label: 'Salons', n: t.salons.length },
    { k: 'filters', label: 'Filtres' },
  ]

  return (
    <div style={{ padding: '22px 26px 40px' }}>
      <PageHead
        title="Talents"
        sub="Les annonces de tes salons Telegram, dédoublonnées et triées. Tu tranches, les matchs partent en favoris."
        actions={<>
          {t.lastDecision && <Btn theme={theme} tone="ghost" sm icon="M3 7v6h6|M21 17a9 9 0 0 0-15-6.7L3 13" label="Annuler" onClick={() => { void t.undo() }} />}
          <Btn theme={theme} tone="ghost" sm icon="M21 12a9 9 0 1 1-9-9|M21 3v6h-6" label="Rafraîchir" onClick={t.reload} />
        </>}
      />

      {t.error && (
        <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 9, fontSize: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#F87171' }}>
          {t.error} — as-tu joué <code>supabase/talents.sql</code> ?
        </div>
      )}

      <div style={{ display: 'flex', gap: 3, padding: 3, marginBottom: 18, width: 'fit-content', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
        {TABS.map(x => (
          <button key={x.k} onClick={() => setTab(x.k)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
            background: tab === x.k ? 'rgba(255,255,255,0.07)' : 'transparent',
            color: tab === x.k ? '#F4F4F6' : '#71717A',
          }}>
            {x.label}
            {x.n != null && <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace", color: tab === x.k ? theme.accentText : '#52525B' }}>{x.n}</span>}
          </button>
        ))}
      </div>

      {t.loading ? <Loading /> :
        tab === 'deck' ? <Deck t={t} theme={theme} salonName={salonName} onRaw={setRaw} /> :
        tab === 'favorites' ? <Favorites t={t} theme={theme} onRaw={setRaw} /> :
        tab === 'salons' ? <Salons t={t} theme={theme} /> :
        <Filters t={t} theme={theme} />}

      {raw && (
        <Modal title={titleOf(raw)} sub={`Message brut · confiance de lecture ${Math.round(raw.parse_confidence * 100)} %`}
          icon="M4 4h16v16H4z|M8 9h8|M8 13h5" theme={theme} onClose={() => setRaw(null)} width={620}>
          <pre style={{
            margin: 0, padding: 13, borderRadius: 9, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 12, lineHeight: 1.6, color: '#C4C4CC', fontFamily: "'JetBrains Mono',monospace",
          }}>{raw.raw_text}</pre>
        </Modal>
      )}
    </div>
  )
}

function Loading() {
  return <div style={{ padding: 60, textAlign: 'center', color: '#52525B', fontSize: 12.5 }}>Chargement des annonces…</div>
}

// ── Onglet Deck ──────────────────────────────────────────────────────────────
function Deck({ t, theme, salonName, onRaw }: {
  t: TalentsState; theme: Theme; salonName: (id: string | null) => string | undefined
  onRaw: (l: TalentListing) => void
}) {
  const [showFiltered, setShowFiltered] = useState(false)
  const stack = t.deck.slice(0, 3)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 22, alignItems: 'start' }}>
      <div>
        <div style={{ position: 'relative', height: 620 }}>
          {stack.length === 0 ? (
            <Panel theme={theme} style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
              <Empty
                icon="M20 6L9 17l-5-5"
                title={t.salons.length ? 'Tout est trié' : 'Aucun salon branché'}
                text={t.salons.length
                  ? 'Plus rien à trancher. Les nouvelles annonces arrivent au fil des messages des salons.'
                  : 'Ajoute un salon Telegram dans l’onglet Salons, puis lance le worker d’ingestion.'}
              />
            </Panel>
          ) : (
            // Empilées en sens inverse : la carte active est la dernière du DOM,
            // donc au-dessus, et les suivantes se devinent derrière.
            [...stack].reverse().map((l, i) => (
              <TalentCard
                key={l.id} listing={l} theme={theme}
                score={t.scoreOf(l)} salonName={salonName(l.salon_id)}
                stackIndex={stack.length - 1 - i}
                onDecide={d => { void t.decide(l, d) }}
                onOpen={() => onRaw(l)}
              />
            ))
          )}
        </div>
        <div style={{ marginTop: 11, textAlign: 'center', fontSize: 11, color: '#52525B' }}>
          Glisse la carte, ou <Kbd>←</Kbd> pass · <Kbd>→</Kbd> match · <Kbd>↓</Kbd> plus tard
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 11 }}>
          <Kpi theme={theme} label="À trier" value={t.deck.length} />
          <Kpi theme={theme} label="Favoris" value={t.favorites.length} color="#34D399" />
          <Kpi theme={theme} label="Écartées auto" value={t.filtered.length} color="#71717A" />
        </div>

        <Panel theme={theme}>
          <PanelHead title="Tri automatique"
            sub={t.modelReady
              ? `Le deck est ordonné par affinité, appris sur tes ${t.decisionCount} décisions.`
              : `${t.decisionCount} / ${MIN_DECISIONS} décisions — sous ce seuil, l'ordre reste chronologique.`}
            right={<Chip text={t.modelReady ? 'Actif' : 'En apprentissage'} tone={t.modelReady ? 'ok' : 'mute'} />}
          />
          <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (t.decisionCount / MIN_DECISIONS) * 100)}%`,
                background: t.modelReady ? '#34D399' : theme.accent, transition: 'width .3s ease',
              }} />
            </div>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: '#71717A' }}>
              Le score n’écarte jamais une annonce : il ne fait que remonter celles qui ressemblent
              à ce que tu retiens d’habitude. Pour exclure pour de bon, c’est l’onglet Filtres.
            </p>
          </div>
        </Panel>

        {t.filtered.length > 0 && (
          <Panel theme={theme}>
            <PanelHead
              title={`${t.filtered.length} annonces écartées par tes filtres`}
              sub="Elles n’entrent pas dans le deck. Vérifie ici que tu ne rates rien."
              right={<Btn theme={theme} tone="ghost" sm label={showFiltered ? 'Masquer' : 'Voir'} onClick={() => setShowFiltered(v => !v)} />}
            />
            {showFiltered && (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {t.filtered.slice(0, 60).map(l => (
                  <button key={l.id} onClick={() => onRaw(l)} style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 15px',
                    border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'transparent',
                    color: 'inherit', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#D4D4D8' }}>{titleOf(l)}</span>
                    <span style={{ fontSize: 11, color: '#F87171' }}>{l.filter_reasons?.[0]}</span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: '#52525B' }}>{fmtMoney(l.fields.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {t.review.length > 0 && (
          <Panel theme={theme}>
            <PanelHead title={`${t.review.length} messages mal lus`} sub="Le parseur n’a pas reconnu assez de champs — un format de salon à ajouter." />
            <div style={{ maxHeight: 210, overflowY: 'auto' }}>
              {t.review.slice(0, 40).map(l => (
                <button key={l.id} onClick={() => onRaw(l)} style={{
                  display: 'block', width: '100%', padding: '9px 15px', border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.04)', background: 'transparent',
                  color: '#A1A1AA', fontFamily: 'inherit', fontSize: 11.5, textAlign: 'left',
                  cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{l.raw_text.slice(0, 90).replace(/\n/g, ' ')}</button>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd style={{
    padding: '1px 5px', margin: '0 2px', borderRadius: 4, fontSize: 10.5,
    fontFamily: "'JetBrains Mono',monospace", background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)', color: '#A1A1AA',
  }}>{children}</kbd>
}

// ── Onglet Favoris ───────────────────────────────────────────────────────────
function Favorites({ t, theme, onRaw }: { t: TalentsState; theme: Theme; onRaw: (l: TalentListing) => void }) {
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const list = t.favorites.filter(f => stage === 'all' || f.stage === stage)

  if (!t.favorites.length) {
    return (
      <Panel theme={theme}>
        <Empty icon="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"
          title="Aucun favori" text="Chaque match du deck atterrit ici, avec son suivi de recrutement." />
      </Panel>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <StageChip label={`Tous · ${t.favorites.length}`} active={stage === 'all'} tone="#A1A1AA" onClick={() => setStage('all')} />
        {STAGES.map(s => (
          <StageChip key={s.k} label={`${s.label} · ${t.favorites.filter(f => f.stage === s.k).length}`}
            active={stage === s.k} tone={s.tone} onClick={() => setStage(s.k)} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {list.map(f => {
          const l = f.listing
          if (!l) return null
          const tone = STAGES.find(s => s.k === f.stage)?.tone ?? '#71717A'
          return (
            <Panel key={f.listing_id} theme={theme} style={{ display: 'flex', flexDirection: 'column' }}>
              {l.photos?.[0]
                ? <img src={l.photos[0].url} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                : <div style={{ height: 56, background: 'repeating-linear-gradient(115deg, #16161B 0 9px, #1B1B21 9px 18px)' }} />}
              <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#F4F4F6' }}>{titleOf(l)}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: '#71717A' }}>Matchée {fmtAgo(f.matched_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                  <span><span style={{ color: '#52525B' }}>Prix </span><b style={{ color: theme.accentText }}>{fmtMoney(l.fields.price)}</b></span>
                  <span><span style={{ color: '#52525B' }}>Salaire </span><b style={{ color: '#D4D4D8' }}>{fmtMoney(l.fields.salary)}</b></span>
                </div>
                {l.fields.middleman && (
                  <div style={{ fontSize: 11.5, color: '#A1A1AA', fontFamily: "'JetBrains Mono',monospace" }}>{l.fields.middleman}</div>
                )}
                <select
                  value={f.stage}
                  onChange={e => { void t.setStage(f.listing_id, e.target.value as Stage) }}
                  style={{
                    marginTop: 'auto', padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                    background: `${tone}14`, border: `1px solid ${tone}44`, color: tone,
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  }}
                >
                  {STAGES.map(s => <option key={s.k} value={s.k} style={{ background: '#131318', color: '#E4E4E7' }}>{s.label}</option>)}
                </select>
                <textarea
                  defaultValue={f.note ?? ''} placeholder="Note (contact, réponse, conditions…)"
                  onBlur={e => { if (e.target.value !== (f.note ?? '')) void t.setNote(f.listing_id, e.target.value) }}
                  style={{
                    minHeight: 46, resize: 'vertical', padding: '7px 9px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                    color: '#D4D4D8', fontFamily: 'inherit', fontSize: 11.5, lineHeight: 1.5,
                  }}
                />
                <button onClick={() => onRaw(l)} style={{
                  alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent',
                  color: '#52525B', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline',
                }}>Message d’origine</button>
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function StageChip({ label, active, tone, onClick }: { label: string; active: boolean; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 12, fontWeight: 700, transition: 'all .14s ease',
      border: `1px solid ${active ? tone + '55' : 'rgba(255,255,255,0.07)'}`,
      background: active ? tone + '18' : 'transparent',
      color: active ? tone : '#71717A',
    }}>{label}</button>
  )
}

// ── Onglet Salons ────────────────────────────────────────────────────────────
function Salons({ t, theme }: { t: TalentsState; theme: Theme }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', username: '', tg_chat_id: '' })
  const valid = form.title.trim() && (form.username.trim() || form.tg_chat_id.trim())

  async function submit() {
    if (!valid) return
    await t.addSalon({
      title: form.title.trim(),
      username: form.username.trim().replace(/^@/, '') || undefined,
      // Sans id numérique, on stocke le @username comme identifiant : le worker
      // résout l'un ou l'autre au démarrage.
      tg_chat_id: form.tg_chat_id.trim() || '@' + form.username.trim().replace(/^@/, ''),
    })
    setForm({ title: '', username: '', tg_chat_id: '' })
    setOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel theme={theme}>
        <PanelHead title="Salons Telegram branchés" sub="Le worker d’ingestion écoute ces canaux et pousse les annonces ici."
          right={<Btn theme={theme} tone="primary" sm icon="M12 5v14|M5 12h14" label="Ajouter" onClick={() => setOpen(true)} />} />
        {t.salons.length === 0 ? (
          <Empty icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" title="Aucun salon"
            text="Lance `npm run login` dans worker-telegram/ : il liste les salons visibles depuis ton compte, avec leur identifiant." />
        ) : t.salons.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 15px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: s.active ? `rgba(${theme.tone},0.12)` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${s.active ? `rgba(${theme.tone},0.28)` : 'rgba(255,255,255,0.07)'}`,
              color: s.active ? theme.accentText : '#52525B',
            }}><Icon d="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" size={15} /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>{s.title}</span>
              <span style={{ fontSize: 11, color: '#71717A', fontFamily: "'JetBrains Mono',monospace" }}>
                {s.username ? '@' + s.username : s.tg_chat_id} · {s.listing_count} annonces
                {s.last_seen_at ? ` · dernier message ${fmtAgo(s.last_seen_at)}` : ' · aucun message reçu'}
              </span>
              {s.last_error && <span style={{ fontSize: 11, color: '#F87171' }}>{s.last_error}</span>}
            </span>
            <Chip text={s.active ? 'Écouté' : 'En pause'} tone={s.active ? 'ok' : 'mute'} />
            <Btn theme={theme} tone="ghost" sm label={s.active ? 'Pause' : 'Reprendre'} onClick={() => { void t.toggleSalon(s.id, !s.active) }} />
            <Btn theme={theme} tone="danger" sm icon="M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6" onClick={() => { void t.removeSalon(s.id) }} />
          </div>
        ))}
      </Panel>

      <Panel theme={theme}>
        <PanelHead title="Le worker d’ingestion" sub="C’est lui qui lit Telegram. L’app ne s’y connecte jamais directement." />
        <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, lineHeight: 1.65, color: '#A1A1AA' }}>
          <p style={{ margin: 0 }}>
            Les identifiants Telegram donnent un accès complet à ton compte : ils vivent dans
            <code style={C}> worker-telegram/.env</code>, sur ta machine ou ton VPS, jamais dans l’app livrée aux clients.
          </p>
          <pre style={PRE}>{`cd worker-telegram
npm install
cp .env.example .env      # api_id / api_hash de my.telegram.org
npm run login             # → colle TG_SESSION dans .env, liste tes salons
npm run backfill          # rattrape l'historique, puis écoute en continu`}</pre>
        </div>
      </Panel>

      {open && (
        <Modal title="Ajouter un salon" sub="Ton compte Telegram doit déjà être membre du salon."
          icon="M12 5v14|M5 12h14" theme={theme} onClose={() => setOpen(false)}
          footer={<>
            <Btn theme={theme} tone="ghost" label="Annuler" onClick={() => setOpen(false)} />
            <Btn theme={theme} tone="primary" label="Ajouter" disabled={!valid} onClick={() => { void submit() }} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <Field label="Nom affiché" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="OF Market · Modèles" />
            <Field label="@username du salon" value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} placeholder="ofmarket_models" hint="Pour un salon public. Laisse vide s’il est privé." />
            <Field label="Identifiant numérique" value={form.tg_chat_id} onChange={v => setForm(f => ({ ...f, tg_chat_id: v }))} placeholder="1234567890" hint="Obligatoire pour un salon privé — `npm run login` l’affiche." />
          </div>
        </Modal>
      )}
    </div>
  )
}

const C: React.CSSProperties = { padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }
const PRE: React.CSSProperties = {
  margin: 0, padding: 12, borderRadius: 9, overflowX: 'auto',
  background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.06)',
  fontSize: 11.5, lineHeight: 1.7, color: '#C4C4CC', fontFamily: "'JetBrains Mono',monospace",
}

function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A1A1AA' }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)', color: '#F4F4F6', fontFamily: 'inherit', fontSize: 12.5,
      }} />
      {hint && <span style={{ fontSize: 11, color: '#52525B' }}>{hint}</span>}
    </label>
  )
}

// ── Onglet Filtres ───────────────────────────────────────────────────────────
function Filters({ t, theme }: { t: TalentsState; theme: Theme }) {
  const [p, setP] = useState<TalentPrefs>(t.prefs)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(p) !== JSON.stringify(t.prefs)

  function num(v: string): number | null { const n = Number(v); return v.trim() === '' || !Number.isFinite(n) ? null : n }

  async function save() {
    await t.savePrefs(p)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 460px) 1fr', gap: 20, alignItems: 'start' }}>
      <Panel theme={theme}>
        <PanelHead title="Filtres durs" sub="Une annonce qui viole une de ces règles n’entre pas dans le deck."
          right={<>
            {saved && <span style={{ fontSize: 11.5, color: '#34D399' }}>Enregistré</span>}
            <Btn theme={theme} tone="primary" sm label="Enregistrer" disabled={!dirty} onClick={() => { void save() }} />
          </>} />
        <div style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <NumField label="Budget max (contrat)" value={p.max_price} onChange={v => setP({ ...p, max_price: num(v) })} placeholder="1500" />
            <NumField label="Anglais minimum" value={p.min_english} onChange={v => setP({ ...p, min_english: num(v) })} placeholder="3" />
            <NumField label="Âge minimum" value={p.min_age} onChange={v => setP({ ...p, min_age: num(v) })} placeholder="18" />
            <NumField label="Âge maximum" value={p.max_age} onChange={v => setP({ ...p, max_age: num(v) })} placeholder="30" />
            <NumField label="Heures / jour minimum" value={p.min_hours} onChange={v => setP({ ...p, min_hours: num(v) })} placeholder="4" />
          </div>
          <Field label="Pays exclus" value={(p.blocked_countries ?? []).join(', ')}
            onChange={v => setP({ ...p, blocked_countries: v.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="Russie, Inde" hint="Séparés par des virgules. Comparaison insensible à la casse et aux accents." />
          <Toggle label="Exiger un compte OnlyFans existant" checked={p.require_onlyfans} onChange={v => setP({ ...p, require_onlyfans: v })} theme={theme} />
          <Toggle label="Exiger l’accès aux comptes" checked={p.require_account_access} onChange={v => setP({ ...p, require_account_access: v })} theme={theme} />
          <Toggle label="Exclure celles déjà sous contrat en agence" checked={p.exclude_with_agency} onChange={v => setP({ ...p, exclude_with_agency: v })} theme={theme} />
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel theme={theme}>
          <PanelHead title="Ce que le modèle a appris de toi"
            sub={t.modelReady ? 'Les traits qui pèsent le plus dans le score d’affinité.' : `Encore ${MIN_DECISIONS - t.decisionCount} décisions avant que le score s’active.`} />
          <div style={{ padding: '13px 15px' }}>
            {t.modelReady
              ? <LearnedTraits t={t} />
              : <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#71717A' }}>
                  Le score se déduit de tes swipes, pas de règles écrites à la main. En dessous de {MIN_DECISIONS} décisions
                  il resterait du bruit : le deck reste donc en ordre chronologique jusque-là.
                </p>}
          </div>
        </Panel>

        <Panel theme={theme}>
          <PanelHead title="Filtres durs et score : deux choses différentes" />
          <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12, lineHeight: 1.65, color: '#A1A1AA' }}>
            <p style={{ margin: 0 }}><b style={{ color: '#E4E4E7' }}>Les filtres</b> retirent. Ils sont explicites, tu les écris, et une annonce
              rejetée est consultable avec sa raison dans l’onglet À trier.</p>
            <p style={{ margin: 0 }}><b style={{ color: '#E4E4E7' }}>Le score</b> ordonne. Il ne retire rien, et il change à chaque swipe.
              Une annonce à faible affinité reste dans le deck, simplement plus bas.</p>
            <p style={{ margin: 0, color: '#71717A' }}>Modifier les filtres n’affecte que les annonces à venir : celles déjà ingérées
              gardent le statut calculé à leur arrivée.</p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function LearnedTraits({ t }: { t: TalentsState }) {
  // On échantillonne le deck pour montrer les traits qui reviennent en tête —
  // une vue d'ensemble du modèle, sans exposer sa mécanique.
  const traits = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>()
    for (const l of t.deck.slice(0, 40)) {
      for (const c of t.scoreOf(l).top) {
        const prev = acc.get(c.feature) ?? { sum: 0, n: 0 }
        acc.set(c.feature, { sum: prev.sum + c.weight, n: prev.n + 1 })
      }
    }
    return [...acc.entries()]
      .map(([f, v]) => ({ f, w: v.sum / v.n, n: v.n }))
      .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
      .slice(0, 8)
  }, [t.deck, t.scoreOf])

  if (!traits.length) return <p style={{ margin: 0, fontSize: 12, color: '#71717A' }}>Rien à trier en ce moment — reviens quand des annonces arrivent.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {traits.map(({ f, w }) => (
        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ flex: 1, color: '#D4D4D8' }}>{explainFeature(f)}</span>
          <span style={{ width: 120, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
            <span style={{
              position: 'absolute', top: 0, bottom: 0, left: '50%',
              width: `${Math.min(50, Math.abs(w) * 18)}%`,
              transform: w < 0 ? 'translateX(-100%)' : 'none',
              background: w > 0 ? '#34D399' : '#F87171',
            }} />
          </span>
          <span style={{ width: 40, textAlign: 'right', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: w > 0 ? '#34D399' : '#F87171' }}>
            {w > 0 ? '+' : ''}{w.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  )
}

function NumField({ label, value, onChange, placeholder }: {
  label: string; value: number | null; onChange: (v: string) => void; placeholder?: string
}) {
  return <Field label={label} value={value == null ? '' : String(value)} onChange={onChange} placeholder={placeholder} />
}

function Toggle({ label, checked, onChange, theme }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; theme: Theme
}) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 9,
      border: `1px solid ${checked ? `rgba(${theme.tone},0.3)` : 'rgba(255,255,255,0.07)'}`,
      background: checked ? `rgba(${theme.tone},0.07)` : 'transparent',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', width: 30, height: 17, borderRadius: 99, padding: 2, flexShrink: 0,
        background: checked ? theme.accentBtn : 'rgba(255,255,255,0.1)', transition: 'background .15s ease',
      }}>
        <span style={{
          width: 13, height: 13, borderRadius: 99, background: '#fff',
          transform: checked ? 'translateX(13px)' : 'none', transition: 'transform .15s ease',
        }} />
      </span>
      <span style={{ fontSize: 12.5, color: checked ? '#F4F4F6' : '#A1A1AA' }}>{label}</span>
    </button>
  )
}
