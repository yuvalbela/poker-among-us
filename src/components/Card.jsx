import { RANK_CHAR, SUIT_SYMBOL } from '../lib/pokerLogic.js'

export default function Card({ card, hidden = false, small = false }) {
  const size = small ? 'w-10 h-14 text-base' : 'w-14 h-20 text-xl'
  if (hidden || !card) {
    return (
      <div
        className={`${size} rounded-md border-2 border-amber-300/40 bg-gradient-to-br from-emerald-800 to-emerald-950 shadow-md`}
      />
    )
  }
  const isRed = card.suit === 'h' || card.suit === 'd'
  const rank = RANK_CHAR[card.rank] || String(card.rank)
  return (
    <div
      className={`${size} rounded-md bg-white shadow-md flex flex-col items-center justify-center font-bold ${
        isRed ? 'text-red-600' : 'text-gray-900'
      }`}
    >
      <div>{rank}</div>
      <div>{SUIT_SYMBOL[card.suit]}</div>
    </div>
  )
}
