import { RANK_CHAR, SUIT_SYMBOL } from '../lib/pokerLogic.js'
import MaskIcon from './MaskIcon.jsx'

/**
 * A single playing card. Shared between player hands and the community board.
 *
 * Props:
 *   card     — { rank, suit } or null/undefined (renders the back design)
 *   size     — 'sm' (mobile / opponent hands) | 'md' (default) | 'lg' (community on desktop)
 *   flipping — one-shot rotate animation (e.g. when a card is revealed)
 *   dealing  — one-shot deal animation (slide + scale when a new card appears)
 */
export default function CardFace({ card, size = 'md', flipping = false, dealing = false, style }) {
  const sizeStyles = SIZES[size] || SIZES.md
  const animClass = dealing ? 'animate-deal' : flipping ? 'animate-flip' : ''

  if (!card) return <CardBack size={size} className={animClass} style={style} />

  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = RANK_CHAR[card.rank] || String(card.rank)
  const suit = SUIT_SYMBOL[card.suit]
  const color = isRed ? '#dc2626' : '#111'

  return (
    <div className={`${sizeStyles.box} rounded-md bg-white border border-gray-200 relative shadow ${animClass}`}
      style={{ borderColor: '#d1d5db', ...style }}>
      {/* Top-left corner: rank stacked above a small suit pip */}
      <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none"
        style={{ color }}>
        <span style={{ fontSize: sizeStyles.rank, fontWeight: 800, lineHeight: 1 }}>{rank}</span>
        <span style={{ fontSize: sizeStyles.cornerSuit, lineHeight: 1 }}>{suit}</span>
      </div>
      {/* Center: big suit */}
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ color, fontSize: sizeStyles.centerSuit, lineHeight: 1 }}>
        {suit}
      </div>
    </div>
  )
}

export function CardBack({ size = 'md', className = '', style }) {
  const sizeStyles = SIZES[size] || SIZES.md
  return (
    <div className={`${sizeStyles.box} rounded-md flex items-center justify-center shadow-md ${className}`}
      style={{
        background: 'linear-gradient(145deg, #b91c1c, #7f1d1d)',
        border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
        ...style,
      }}>
      <MaskIcon style={{ width: '70%', height: 'auto', opacity: 0.5 }} />
    </div>
  )
}

// Single source of truth for card sizing.
const SIZES = {
  sm: { box: 'w-11 h-16', rank: '12px', cornerSuit: '13px', centerSuit: '26px' },
  md: { box: 'w-14 h-20', rank: '15px', cornerSuit: '13px', centerSuit: '34px' },
  lg: { box: 'w-16 h-24', rank: '18px', cornerSuit: '15px', centerSuit: '40px' },
}
