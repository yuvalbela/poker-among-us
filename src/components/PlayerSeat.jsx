import { RANK_CHAR, SUIT_SYMBOL } from '../lib/pokerLogic.js'
import MaskIcon from './MaskIcon.jsx'

function CardBack() {
  return (
    <div className="w-14 h-20 rounded-md flex items-center justify-center shadow-md"
      style={{
        background: 'linear-gradient(145deg, #b91c1c, #7f1d1d)',
        border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
      }}>
      <MaskIcon style={{ width: '70%', height: 'auto', opacity: 0.5 }} />
    </div>
  )
}

function CardFace({ card, flipping = false }) {
  if (!card) return <CardBack />
  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = RANK_CHAR[card.rank] || String(card.rank)
  const suit = SUIT_SYMBOL[card.suit]
  const color = isRed ? '#dc2626' : '#111'
  return (
    <div className={`w-14 h-20 rounded-md bg-white border border-gray-200 relative shadow ${flipping ? 'animate-flip' : ''}`}
      style={{ borderColor: '#d1d5db' }}>
      {/* Top-left: rank + suit small */}
      <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none"
        style={{ color }}>
        <span style={{ fontSize: '15px', fontWeight: 800, lineHeight: 1 }}>{rank}</span>
        <span style={{ fontSize: '13px', lineHeight: 1 }}>{suit}</span>
      </div>
      {/* Center: large suit */}
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ color, fontSize: '34px', lineHeight: 1 }}>
        {suit}
      </div>
    </div>
  )
}

export default function PlayerSeat({
  player, hand, cards, revealedCards,
  isMe, isCurrent, isDealer, isSB, isBB,
  chatMessage,
}) {
  const folded = hand?.status === 'folded'
  const allIn = hand?.status === 'all_in'
  const bet = hand?.current_bet ?? 0

  const seatBg = isCurrent ? 'rgba(180,130,0,0.35)' : folded ? 'rgba(20,20,20,0.7)' : 'rgba(25,25,35,0.88)'

  return (
    <div className={`flex flex-col items-center select-none ${folded ? 'opacity-45' : ''}`}
      style={{ gap: '3px', minWidth: '84px' }}>

      {/* Speech bubble */}
      {chatMessage && (
        <div className="max-w-[110px] bg-white/95 text-gray-800 text-[10px] px-2 py-1 rounded-lg shadow-lg truncate mb-0.5"
          style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
          {chatMessage}
        </div>
      )}

      {/* Cards — fanned/angled */}
      {isMe ? (
        // My cards: also fanned
        <div className="relative" style={{ width: '80px', height: '88px' }}>
          {(cards || [null, null]).map((c, i) => {
            const angle = i === 0 ? -18 : 8
            const offsetX = i === 0 ? 0 : 24
            const offsetY = i === 0 ? 6 : 5
            return (
              <div key={i} style={{
                position: 'absolute',
                left: `${offsetX}px`,
                top: `${offsetY}px`,
                transform: `rotate(${angle}deg)`,
                zIndex: i,
                filter: 'drop-shadow(2px 3px 5px rgba(0,0,0,0.6))',
              }}>
                <CardFace card={c} />
              </div>
            )
          })}
        </div>
      ) : (
        // Opponents: fanned with angle and overlap
        <div className="relative" style={{ width: '80px', height: '88px' }}>
          {[0, 1].map((i) => {
            const revealed = revealedCards?.[i]
            const angle = i === 0 ? -18 : 8
            const offsetX = i === 0 ? 0 : 24
            const offsetY = i === 0 ? 6 : 5
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${offsetX}px`,
                  top: `${offsetY}px`,
                  transform: `rotate(${angle}deg)`,
                  zIndex: i,
                  filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.55))',
                }}
              >
                {revealed
                  ? <CardFace card={revealed} flipping />
                  : <CardBack />
                }
              </div>
            )
          })}
        </div>
      )}

      {/* Seat box — name + chips */}
      <div className="rounded-lg overflow-hidden text-center w-full"
        style={{
          background: seatBg,
          border: isCurrent ? '1px solid rgba(200,150,0,0.7)' : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isCurrent ? '0 0 8px rgba(200,150,0,0.4)' : 'none',
        }}>
        <div className="px-2 py-0.5 text-[11px] font-semibold text-white/90 truncate flex items-center justify-center gap-1">
          {isDealer && <span className="text-[9px] bg-white/20 px-1 rounded">D</span>}
          {isSB && <span className="text-[9px] text-blue-300">SB</span>}
          {isBB && <span className="text-[9px] text-red-300">BB</span>}
          <span className="max-w-[65px] truncate">{player?.name || '?'}</span>
        </div>
        <div className="px-2 pb-0.5 text-[10px] font-bold"
          style={{ color: '#e8c44a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {allIn ? <span className="text-purple-300">ALL-IN</span> : (player?.chips ?? 0)}
        </div>
      </div>

      {/* Bet chip */}
      {bet > 0 && (
        <div className="text-[10px] bg-amber-700/80 text-amber-100 px-1.5 py-0.5 rounded-full font-bold">
          {bet}
        </div>
      )}
    </div>
  )
}
