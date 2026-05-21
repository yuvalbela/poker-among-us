// Quick sanity tests for pokerLogic. Run with: node src/lib/pokerLogic.test.mjs
import {
  createDeck,
  shuffle,
  cardToString,
  evaluateFive,
  findBestHand,
  compareEval,
  HAND_CATEGORIES,
} from './pokerLogic.js'

function card(rank, suit) {
  return { rank, suit }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('ok:', msg)
  }
}

// 1) Deck has 52 unique cards
const deck = createDeck()
assert(deck.length === 52, 'deck has 52 cards')
const sigs = new Set(deck.map((c) => c.rank + c.suit))
assert(sigs.size === 52, 'all 52 cards unique')

// 2) Shuffle preserves cards
const shuffled = shuffle(deck)
const shuffledSigs = new Set(shuffled.map((c) => c.rank + c.suit))
assert(shuffledSigs.size === 52, 'shuffle preserves 52 unique')

// 3) Royal flush beats four of a kind
const royal = [card(14, 's'), card(13, 's'), card(12, 's'), card(11, 's'), card(10, 's')]
const quads = [card(14, 'h'), card(14, 'd'), card(14, 'c'), card(14, 's'), card(13, 'h')]
const royalEv = evaluateFive(royal)
const quadsEv = evaluateFive(quads)
assert(royalEv.category === 9, 'royal flush is category 9 (straight flush)')
assert(quadsEv.category === 8, 'four aces is category 8')
assert(compareEval(royalEv, quadsEv) === 1, 'royal beats quads')

// 4) Wheel straight A-2-3-4-5
const wheel = [card(14, 'h'), card(2, 's'), card(3, 'd'), card(4, 'c'), card(5, 'h')]
const wheelEv = evaluateFive(wheel)
assert(wheelEv.category === 5, 'wheel is a straight')
assert(wheelEv.tiebreakers[0] === 5, 'wheel high card is 5')

// 5) Flush vs straight — flush wins
const flush = [card(14, 'h'), card(10, 'h'), card(7, 'h'), card(5, 'h'), card(2, 'h')]
const straight = [card(9, 's'), card(8, 'h'), card(7, 'd'), card(6, 'c'), card(5, 's')]
assert(compareEval(evaluateFive(flush), evaluateFive(straight)) === 1, 'flush beats straight')

// 6) Full house vs flush — full house wins
const full = [card(10, 'h'), card(10, 's'), card(10, 'd'), card(5, 'c'), card(5, 'h')]
assert(compareEval(evaluateFive(full), evaluateFive(flush)) === 1, 'full house beats flush')

// 7) Two pair tiebreaker (higher pair wins)
const twoPairHi = [card(13, 'h'), card(13, 's'), card(5, 'd'), card(5, 'c'), card(2, 'h')]
const twoPairLo = [card(12, 'h'), card(12, 's'), card(11, 'd'), card(11, 'c'), card(2, 'h')]
assert(compareEval(evaluateFive(twoPairHi), evaluateFive(twoPairLo)) === 1, 'KK55 beats QQJJ')

// 8) findBestHand picks best 5 of 7
const hole = [card(14, 's'), card(13, 's')]
const community = [card(12, 's'), card(11, 's'), card(10, 's'), card(2, 'h'), card(3, 'd')]
const best = findBestHand([...hole, ...community])
assert(best.category === 9, 'best of 7 finds royal flush')

console.log('\nCategory:', HAND_CATEGORIES[best.category])
console.log('Best 5 cards:', best.cards.map(cardToString).join(' '))
