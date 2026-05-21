import { useEffect, useRef, useState } from 'react'
import Card from './Card.jsx'
import MaskIcon from './MaskIcon.jsx'
import PlayerSeat from './PlayerSeat.jsx'

// Seat positions as [xPercent, yPercent] relative to the table container
// Index 0 = "me" (always bottom-center), rest = opponents clockwise from top
const PORTRAIT_POSITIONS = {
  2: [[50, 90], [50, 12]],
  3: [[50, 90], [8, 12],  [92, 12]],
  4: [[50, 90], [5, 50],  [50, 12],  [95, 50]],
  5: [[50, 90], [5, 68],  [8, 14],  [92, 14], [95, 68]],
  6: [[50, 90], [5, 72],  [5, 22],  [50, 12],  [95, 22], [95, 72]],
}

const LANDSCAPE_POSITIONS = {
  2: [[50, 90], [50, 6]],
  3: [[50, 90], [8, 8],  [92, 8]],
  4: [[50, 90], [3, 46],  [50, 6],  [97, 46]],
  5: [[50, 90], [3, 66],  [8, 8],   [92, 8],  [97, 66]],
  6: [[50, 90], [3, 70],  [3, 20],  [50, 6],  [97, 20], [97, 70]],
}

function PotChip({ targetX, targetY, amount, delay = 0 }) {
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMoved(true), 30 + delay)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: moved ? `${targetX}%` : '50%',
        top: moved ? `${targetY}%` : '50%',
        transform: 'translate(-50%, -50%)',
        transition: moved
          ? `left 0.65s cubic-bezier(0.4,0,0.2,1), top 0.65s cubic-bezier(0.4,0,0.2,1), opacity 0.25s 0.6s`
          : 'none',
        opacity: moved ? 0 : 1,
        zIndex: 30,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(15,10,0,0.92)',
        border: '2px solid #e8c44a',
        borderRadius: '999px',
        padding: '4px 12px',
        boxShadow: '0 0 16px rgba(232,196,74,0.7), 0 2px 8px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '14px' }}>🪙</span>
      <span style={{ color: '#e8c44a', fontWeight: 800, fontSize: '14px' }}>{amount}</span>
    </div>
  )
}

function useOrientation() {
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight)
  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', () => setTimeout(update, 100))
    return () => window.removeEventListener('resize', update)
  }, [])
  return landscape
}

export default function PokerTable({
  players,
  hands,
  holeCards,
  revealedByTraitor, // { playerId: { cardIndex: card } }
  round,
  me,
  lastMessages, // { playerId: string }
}) {
  const isLandscape = useOrientation()

  // ── Pot animation hooks (must be before any early return) ──
  const prevPhaseRef = useRef(null)
  const [potAnim, setPotAnim] = useState(null)

  const phase = round?.phase

  useEffect(() => {
    const prev = prevPhaseRef.current
    prevPhaseRef.current = phase
    if (!((phase === 'showdown' || phase === 'finished') && prev !== phase)) return
    if (!round?.pot || !hands.length || !players.length) return

    const sortedAnim = [...players].sort((a, b) => (a.seat_number ?? 99) - (b.seat_number ?? 99))
    const animMyIdx = sortedAnim.findIndex((p) => p.id === me?.id)
    const ord = animMyIdx >= 0
      ? [...sortedAnim.slice(animMyIdx), ...sortedAnim.slice(0, animMyIdx)]
      : sortedAnim
    const cnt = Math.min(ord.length, 6)
    const pos = isLandscape
      ? (LANDSCAPE_POSITIONS[cnt] || LANDSCAPE_POSITIONS[2])
      : (PORTRAIT_POSITIONS[cnt] || PORTRAIT_POSITIONS[2])

    const notFolded = hands.filter(h => h.status !== 'folded')
    if (!notFolded.length) return
    const share = Math.floor(round.pot / notFolded.length)
    const targets = notFolded.map(h => {
      const pidx = ord.findIndex(p => p.id === h.player_id)
      const [px, py] = (pidx >= 0 && pos[pidx]) ? pos[pidx] : [50, 50]
      return { tx: px, ty: py, amount: share }
    })
    setPotAnim(targets)
    setTimeout(() => setPotAnim(null), 1200)
  }, [phase])

  if (!players.length) return null

  // Sort by seat_number clockwise, rotate so "me" is first (bottom)
  const sorted = [...players]
    .filter(p => {
      // Only show players who have a hand in the current round
      // (new joiners waiting for next round have no hand → hidden)
      if (!hands.length) return true  // still loading — show all
      return hands.some(h => h.player_id === p.id)
    })
    .sort((a, b) => (a.seat_number ?? 99) - (b.seat_number ?? 99))
  const sortedMyIndex = sorted.findIndex((p) => p.id === me?.id)
  const ordered = sortedMyIndex >= 0
    ? [...sorted.slice(sortedMyIndex), ...sorted.slice(0, sortedMyIndex)]
    : sorted
  const count = Math.min(ordered.length, 6)
  const positions = isLandscape
    ? (LANDSCAPE_POSITIONS[count] || LANDSCAPE_POSITIONS[2])
    : (PORTRAIT_POSITIONS[count] || PORTRAIT_POSITIONS[2])

  // Dealer/SB/BB detection (seats from player_hands seat_index)
  const dealerIdx = round?.dealer_index ?? 0
  const sbIdx = players.length === 2 ? dealerIdx : (dealerIdx + 1) % players.length
  const bbIdx = players.length === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % players.length
  function getPlayerSeatIndex(player) {
    const hand = hands.find((h) => h.player_id === player.id)
    return hand?.seat_index ?? -1
  }

  const showdownRevealed = phase === 'showdown' || phase === 'finished'

  return (
    <div className="relative w-full h-full">
      {/* === TABLE OUTER SHADOW === */}
      <div
        className="absolute"
        style={{
          inset: isLandscape ? '4%' : '3%',
          borderRadius: isLandscape ? '50%' : '22px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          background: 'transparent',
          zIndex: 0,
        }}
      />
      {/* === TABLE RIM === */}
      <div
        className="absolute"
        style={{
          inset: isLandscape ? '4%' : '3%',
          borderRadius: isLandscape ? '50%' : '22px',
          background: '#0d0d0d',
          padding: isLandscape ? '10px' : '8px',
          zIndex: 1,
        }}
      >
        {/* === TABLE FELT (inner green) === */}
        <div
          className="absolute"
          style={{
            inset: isLandscape ? '10px' : '8px',
            borderRadius: isLandscape ? 'calc(50% - 10px)' : '16px',
            background: [
              'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.07) 0%, transparent 60%)',
              'radial-gradient(ellipse at 50% 38%, #42ae68 0%, #2d9650 35%, #1c6e38 65%, #124d28 100%)',
            ].join(', '),
            backgroundBlendMode: 'overlay, normal',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.45)',
            // Felt texture via pseudo-element simulation with repeating pattern
            backgroundImage: [
              'repeating-linear-gradient(45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
              'repeating-linear-gradient(-45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
              'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.07) 0%, transparent 60%)',
              'radial-gradient(ellipse at 50% 38%, #42ae68 0%, #2d9650 35%, #1c6e38 65%, #124d28 100%)',
            ].join(', '),
          }}
        >
        {/* IMPOKER logo — between community cards and bottom player */}
        <div className="absolute bottom-[22%] left-0 right-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none select-none">
          <MaskIcon
            style={{
              width: isLandscape ? '7%' : '13%',
              height: 'auto',
              opacity: 0.18,
            }}
          />
          <span style={{
            color: 'rgba(255,255,255,0.28)',
            fontWeight: 800,
            letterSpacing: '0.25em',
            fontSize: isLandscape ? '1.1rem' : '0.95rem',
          }}>
            IMPOKER
          </span>
        </div>

        {/* Community cards + pot */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          {round?.community_cards?.length > 0 && (
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} card={round.community_cards[i]} hidden={!round.community_cards[i]}
                  small={false} />
              ))}
            </div>
          )}
          {round && (
            <div className="bg-black/40 text-amber-300 font-bold px-3 py-0.5 rounded-full text-sm">
              {round.pot > 0 ? `${round.pot}` : ''}
            </div>
          )}
        </div>{/* end cards/pot */}

        {/* ── POT ANIMATION chips ── */}
        {potAnim && potAnim.map((target, i) => (
          <PotChip key={i} targetX={target.tx} targetY={target.ty} amount={target.amount} delay={i * 120} />
        ))}

        </div>{/* end felt */}
      </div>{/* end rim */}

      {/* === PLAYER SEATS (absolute positioned around table) === */}
      {ordered.slice(0, count).map((player, idx) => {
        const [xPct, yPct] = positions[idx] || [50, 50]
        const isMe = player.id === me?.id
        const hand = hands.find((h) => h.player_id === player.id)
        const seatIdx = getPlayerSeatIndex(player)
        const myCards = isMe ? (holeCards[hand?.id] ?? null) : null
        const opponentRevealed = revealedByTraitor?.[player.id] ?? {}
        const isCurrent = round && hand && round.current_turn_index === hand.seat_index
          && hand.status === 'active' && phase !== 'showdown' && phase !== 'finished'
        const allCards = showdownRevealed ? (holeCards[hand?.id] ?? null) : null

        return (
          <div
            key={player.id}
            className="absolute"
            style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)', zIndex: 10 }}
          >
            <PlayerSeat
              player={player}
              hand={hand}
              cards={isMe ? myCards : (showdownRevealed ? allCards : null)}
              revealedCards={isMe ? null : opponentRevealed}
              isMe={isMe}
              isCurrent={isCurrent}
              isDealer={seatIdx === dealerIdx}
              isSB={seatIdx === sbIdx}
              isBB={seatIdx === bbIdx}
              chatMessage={lastMessages?.[player.id]}
              small={!isLandscape}
            />
          </div>
        )
      })}
    </div>
  )
}
