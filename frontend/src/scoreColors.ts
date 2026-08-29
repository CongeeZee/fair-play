import { CLAY } from './theme'

/**
 * Semantic colours for the score scale.
 *
 * Nine files each defined their own local `scoreColor(diff)` returning a bare
 * hex, and every one of those hexes was then used in two incompatible roles:
 * as a chip background with white text on it, and as body text on a cream
 * card. A mid-tone cannot do both. #e0b95c carried white at 1.86:1 as a fill
 * and sat on cream at 1.73:1 as text — it failed in *both* directions, which
 * is the tell that the value was never wrong so much as overloaded.
 *
 * So a band exposes three values instead of one:
 *   fill — dark enough that `on` is readable against it
 *   on   — the foreground to pair with `fill`, never assumed to be white
 *   text — the same hue pushed dark enough to read on a light surface
 *
 * All six are theme custom properties, so they follow sunlight mode without
 * any call site knowing that sunlight mode exists.
 *
 * Thresholds stay at the call sites. Pages disagree about where "modest over
 * par" ends (three strokes on a round page, five in history, ten in the course
 * table) and that disagreement is deliberate — a hole and a season are not the
 * same scale. Only the colours are shared.
 */
export interface ScoreBand {
  fill: string
  on: string
  text: string
}

export const SCORE: Record<'under' | 'even' | 'over' | 'poor', ScoreBand> = {
  under: { fill: CLAY.gold, on: CLAY.onGold, text: CLAY.goldText },
  even: { fill: CLAY.green, on: '#ffffff', text: CLAY.greenText },
  over: { fill: CLAY.clayBlue, on: '#ffffff', text: CLAY.infoText },
  poor: { fill: CLAY.redDeep, on: '#ffffff', text: CLAY.errorText },
}

/** Bands for a score relative to par, with a caller-supplied "modest" cutoff. */
export function scoreBand(toPar: number, modestOver = 5): ScoreBand {
  if (toPar < 0) return SCORE.under
  if (toPar === 0) return SCORE.even
  if (toPar <= modestOver) return SCORE.over
  return SCORE.poor
}

/**
 * Per-hole result bands. A hole is a much tighter scale than a round: one over
 * is a bogey, not a "modest" result, so this is kept separate rather than
 * folded into `scoreBand` with a cutoff of 0.
 */
export function holeBand(diff: number): ScoreBand {
  if (diff < 0) return SCORE.under
  if (diff === 0) return SCORE.even
  if (diff === 1) return SCORE.over
  return SCORE.poor
}

/**
 * Foregrounds for text sitting on the dark green header or banner
 * (primary.main, #2f6b4c in clay and #2c6347 in sunlight).
 *
 * These are deliberately not the same values as `SCORE.*.text`. A hue that
 * reads as "red" on cream is far too dark to read on dark green, and vice
 * versa — contrast is a relationship, not a property of a colour, so a scale
 * meant for two different backdrops needs two sets of values. Every entry
 * clears 4.5:1 against the darker of the two greens.
 *
 * They are literal rather than custom properties because the green header is
 * the one surface that does not change between appearances.
 */
export const ON_GREEN = {
  gold: '#f5dca4', // 4.70:1
  green: '#c4ead1', // 4.82:1
  red: '#fad9d4', // 4.79:1
  neutral: '#e9e1d3', // 4.86:1
  soft: '#e4ede8', // 5.28:1 — secondary text
} as const

/**
 * Good/neutral/bad for percentages, trends and strokes-gained figures, where
 * the meaning is directional rather than a score.
 */
export const SENTIMENT = {
  good: { fill: CLAY.green, on: '#ffffff', text: CLAY.successText },
  warn: { fill: CLAY.gold, on: CLAY.onGold, text: CLAY.warningText },
  bad: { fill: CLAY.redDeep, on: '#ffffff', text: CLAY.errorText },
  neutral: { fill: CLAY.sunken, on: CLAY.ink, text: CLAY.inkSoft },
} satisfies Record<string, ScoreBand>
