// Carte d'annonce du deck « match or pass ».
//
// Elle se manipule de trois façons, parce que trois usages coexistent : la
// souris (glisser), le clavier (← → ↓ U — de loin le plus rapide quand on
// enchaîne 200 annonces) et les boutons (découverte, tactile).
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Theme } from '@/lib/theme'
import { Icon, Chip } from '@/lib/ui'
import {
  fmtMoney, fmtAgo, titleOf, explainFeature,
  type TalentListing, type Decision,
} from '@/lib/talents'

const THRESHOLD = 110      // px de glissement avant validation

export default function TalentCard({
  listing, theme, score, salonName, onDecide, onOpen, stackIndex = 0,
}: {
  listing: TalentListing
  theme: Theme
  score?: { ready: boolean; score: number | null; top: { feature: string; weight: number }[] }
  salonName?: string
  onDecide: (d: Decision) => void
  onOpen?: () => void
  stackIndex?: number
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [leaving, setLeaving] = useState<Decision | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const f = listing.fields

  // Une décision part en animation avant d'être remontée : sans ça, la carte
  // disparaît d'un coup et on perd le retour visuel de ce qu'on vient de faire.
  // Pendant ces 130 ms les touches sont ignorées, volontairement : la carte
  // suivante n'a pas encore été lue, la valider à l'aveugle serait pire que
  // perdre l'appui.
  function fire(d: Decision) {
    if (leaving) return
    setLeaving(d)
    setTimeout(() => onDecide(d), 130)
  }

  useEffect(() => {
    if (stackIndex !== 0) return
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); fire('pass') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); fire('match') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); fire('later') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stackIndex, leaving])

  function onPointerDown(e: React.PointerEvent) {
    if (stackIndex !== 0) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0 })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })
  }
  function onPointerUp() {
    if (!drag) { start.current = null; return }
    const { x, y } = drag
    start.current = null
    setDrag(null)
    if (x > THRESHOLD) fire('match')
    else if (x < -THRESHOLD) fire('pass')
    else if (y > THRESHOLD) fire('later')
  }

  const dx = leaving === 'match' ? 560 : leaving === 'pass' ? -560 : drag?.x ?? 0
  const dy = leaving === 'later' ? 420 : drag?.y ?? 0
  const rot = dx / 26
  const intent: Decision | null = leaving ?? (drag && drag.x > 55 ? 'match' : drag && drag.x < -55 ? 'pass' : drag && drag.y > 55 ? 'later' : null)

  // Les cartes du dessous ne montrent que leur châssis : superposer leur contenu
  // ne donne aucune information et rend la carte active illisible en transparence.
  if (stackIndex > 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 10 - stackIndex, borderRadius: 16,
        background: theme.panelBg, border: `1px solid ${theme.panelEdge}`,
        transform: `translateY(${stackIndex * 13}px) scale(${1 - stackIndex * 0.03})`,
        opacity: 1 - stackIndex * 0.4, pointerEvents: 'none',
      }} />
    )
  }

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{
        position: 'absolute', inset: 0, zIndex: 10 - stackIndex,
        display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
        background: theme.panelBg, border: `1px solid ${theme.panelEdge}`,
        boxShadow: '0 26px 60px -28px rgba(0,0,0,0.85)',
        cursor: drag ? 'grabbing' : 'grab',
        touchAction: 'none', userSelect: 'none',
        transition: drag ? 'none' : 'transform .15s cubic-bezier(0.4,0,0.2,1), opacity .15s ease',
        transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
        opacity: leaving ? 0 : 1,
      }}
    >
      <Photos listing={listing} />

      {/* Verdict imprimé sur la carte pendant le glissement — on voit ce qu'on
          est en train de décider avant de relâcher. */}
      {intent && (
        <div style={{
          position: 'absolute', top: 22, [intent === 'pass' ? 'right' : 'left']: 22,
          padding: '7px 14px', borderRadius: 9, fontSize: 15, fontWeight: 800, letterSpacing: '0.06em',
          transform: `rotate(${intent === 'pass' ? 11 : -11}deg)`, pointerEvents: 'none',
          color: intent === 'match' ? '#34D399' : intent === 'pass' ? '#F87171' : '#FBBF24',
          border: `2px solid ${intent === 'match' ? '#34D399' : intent === 'pass' ? '#F87171' : '#FBBF24'}`,
          background: 'rgba(9,9,12,0.72)', backdropFilter: 'blur(2px)',
        } as CSSProperties}>
          {intent === 'match' ? 'MATCH' : intent === 'pass' ? 'PASS' : 'PLUS TARD'}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '15px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: '#F4F4F6' }}>{titleOf(listing)}</div>
            <div style={{ marginTop: 3, fontSize: 11.5, color: '#71717A' }}>
              {salonName ?? 'Salon inconnu'} · {fmtAgo(listing.posted_at)}
              {listing.listing_id ? ` · #${listing.listing_id}` : ''}
            </div>
          </div>
          {score?.ready && score.score != null && (
            <ScoreBadge value={score.score} top={score.top} />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Prix" value={fmtMoney(f.price)} strong theme={theme} />
          <Stat label="Salaire" value={fmtMoney(f.salary)} theme={theme} />
          <Stat label="Anglais" value={f.english_level != null ? `${f.english_level}/5` : '—'} theme={theme} />
          <Stat label="Heures / jour" value={f.hours_per_day?.hours != null ? `${f.hours_per_day.hours} h` : (f.hours_per_day?.raw ?? '—')} theme={theme} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {f.onlyfans === true && <Chip text="OnlyFans" tone="ok" />}
          {f.reels === true && <Chip text="TikTok / Reels" tone="info" />}
          {f.account_access === true && <Chip text="Accès comptes" tone="ok" />}
          {f.account_access === false && <Chip text="Pas d’accès" tone="mute" />}
          {f.with_agency === true && <Chip text="Déjà en agence" tone="warn" />}
          {f.warranty != null && <Chip text={`Garantie ${f.warranty} j`} tone="violet" />}
          {f.can_start && <Chip text={`Dispo · ${f.can_start}`} tone="mute" />}
          {listing.seen_in?.length > 1 && <Chip text={`Vue dans ${listing.seen_in.length} salons`} tone="warn" />}
        </div>

        {!!f.content_types?.length && (
          <Row label="Contenu" value={f.content_types.join(' · ')} />
        )}
        {!!f.blocked_countries?.length && (
          <Row label="Pays bloqués" value={f.blocked_countries.join(', ')} />
        )}
        {f.device && <Row label="Téléphone" value={f.device} />}
        {f.additional_info && <Row label="Infos" value={f.additional_info} />}
        {f.middleman && <Row label="Intermédiaire" value={f.middleman} mono />}

        {onOpen && (
          <button onClick={onOpen} style={{
            alignSelf: 'flex-start', marginTop: 'auto', padding: '6px 10px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)', background: 'transparent',
            color: '#A1A1AA', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>Voir le message brut</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '11px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Action label="Pass" hint="←" color="#F87171" icon="M18 6L6 18|M6 6l12 12" onClick={() => fire('pass')} />
        <Action label="Plus tard" hint="↓" color="#FBBF24" icon="M12 6v6l4 2|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" onClick={() => fire('later')} narrow />
        <Action label="Match" hint="→" color="#34D399" icon="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" onClick={() => fire('match')} filled />
      </div>
    </div>
  )
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function Photos({ listing }: { listing: TalentListing }) {
  const [i, setI] = useState(0)
  const photos = listing.photos ?? []
  if (!photos.length) {
    return (
      <div style={{
        height: 132, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, color: '#52525B', fontSize: 11.5,
        background: 'repeating-linear-gradient(115deg, #16161B 0 9px, #1B1B21 9px 18px)',
      }}>
        <Icon d="M3 5h18v14H3z|M8 11l3 3 5-5 5 5" size={15} /> Aucune photo dans l’annonce
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', height: 236, flexShrink: 0, background: '#0D0D11' }}>
      <img
        src={photos[i].url} alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 62%, rgba(9,9,12,0.85))' }} />
      {photos.length > 1 && (
        <>
          <div style={{ position: 'absolute', top: 8, left: 10, right: 10, display: 'flex', gap: 3 }}>
            {photos.map((_, n) => (
              <span key={n} style={{ flex: 1, height: 2.5, borderRadius: 2, background: n === i ? '#F4F4F6' : 'rgba(255,255,255,0.25)' }} />
            ))}
          </div>
          {/* Zones de tap gauche/droite : on parcourt les photos sans bouton visible. */}
          <button aria-label="Photo précédente" onPointerDown={e => { e.stopPropagation(); setI(n => Math.max(0, n - 1)) }}
            style={{ position: 'absolute', left: 0, top: 14, bottom: 0, width: '35%', border: 'none', background: 'transparent', cursor: 'pointer' }} />
          <button aria-label="Photo suivante" onPointerDown={e => { e.stopPropagation(); setI(n => Math.min(photos.length - 1, n + 1)) }}
            style={{ position: 'absolute', right: 0, top: 14, bottom: 0, width: '35%', border: 'none', background: 'transparent', cursor: 'pointer' }} />
        </>
      )}
    </div>
  )
}

function ScoreBadge({ value, top }: { value: number; top: { feature: string; weight: number }[] }) {
  const color = value >= 70 ? '#34D399' : value >= 45 ? '#FBBF24' : '#F87171'
  return (
    <div
      title={top.map(t => `${t.weight > 0 ? '+' : '−'} ${explainFeature(t.feature)}`).join('\n')}
      style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        padding: '5px 9px', borderRadius: 9, border: `1px solid ${color}44`, background: `${color}14`,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', color: '#71717A' }}>AFFINITÉ</span>
    </div>
  )
}

function Stat({ label, value, strong, theme }: { label: string; value: string; strong?: boolean; theme: Theme }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B' }}>{label}</div>
      <div style={{
        marginTop: 3, fontSize: strong ? 15 : 13, fontWeight: 700,
        color: strong ? theme.accentText : '#E4E4E7', fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, width: 92, color: '#52525B' }}>{label}</span>
      <span style={{ color: '#C4C4CC', fontFamily: mono ? "'JetBrains Mono',monospace" : 'inherit', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function Action({ label, hint, color, icon, onClick, filled, narrow }: {
  label: string; hint: string; color: string; icon: string
  onClick: () => void; filled?: boolean; narrow?: boolean
}) {
  return (
    <button
      onClick={onClick} onPointerDown={e => e.stopPropagation()}
      style={{
        flex: narrow ? '0 0 auto' : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 7, height: 36, padding: '0 13px', borderRadius: 9, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, transition: 'all .14s ease',
        border: `1px solid ${color}${filled ? '' : '33'}`,
        background: filled ? `${color}22` : 'rgba(255,255,255,0.02)',
        color,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}26` }}
      onMouseLeave={e => { e.currentTarget.style.background = filled ? `${color}22` : 'rgba(255,255,255,0.02)' }}
    >
      <Icon d={icon} size={14} />
      {label}
      <span style={{ fontSize: 10, opacity: 0.6, fontFamily: "'JetBrains Mono',monospace" }}>{hint}</span>
    </button>
  )
}
