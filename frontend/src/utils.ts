
export function timeAgo(date: string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Turn a stored course name into something readable.
 *
 * Names arrive from the course API as, e.g.,
 *   "Avondale Golf Club — 20102, USGA, Black, Men Tees"
 * where the tee name has the provider's layout id and rating system packed
 * into it. The em dash is the delimiter the import writes between the club and
 * the tee set; it is a storage detail and does not belong on screen, so the tee
 * set is rendered as a parenthetical instead:
 *   "Avondale Golf Club (Black Men Tees)"
 *
 * A trailing "(Women's)" written by the import survives as a second clause —
 * "Avondale Golf Club (White Tees, Women's)" — because it is the only thing
 * distinguishing that course from the men's tee set of the same colour.
 */
export function formatCourseName(name: string): string {
  const sep = ' — '
  const idx = name.indexOf(sep)
  if (idx === -1) return name

  const base = name.slice(0, idx)
  let tail = name.slice(idx + sep.length)

  // Pull off a trailing qualifier the import added, e.g. "White Tees (Women's)".
  let qualifier = ''
  const qualifierMatch = tail.match(/\s*\(([^)]+)\)\s*$/)
  if (qualifierMatch) {
    qualifier = qualifierMatch[1]
    tail = tail.slice(0, qualifierMatch.index)
  }

  const teeClean = tail
    .replace(/ Tees$/, '')
    .split(',')
    .map((s) => s.trim())
    // Drop the provider's layout id and the rating system: neither means
    // anything to a golfer reading a scorecard.
    .filter((s) => s.length > 0 && !/^\d+$/.test(s) && s.toUpperCase() !== 'USGA')
    .join(' ')

  const inner = qualifier ? `${teeClean} Tees, ${qualifier}` : `${teeClean} Tees`
  return `${base} (${inner})`
}

/**
 * Format a Handicap Index the way golf writes one.
 *
 * A better-than-scratch index is a "plus" handicap — the player gives strokes
 * back rather than receiving them — and is written +4.9, not -4.9. Getting this
 * wrong is not just notation: "-4.9" reads as four and a bit strokes of help,
 * which is the opposite of what it means.
 *
 * Everything else prints as-is, so a 12.3 stays 12.3 and scratch is 0.0.
 */
export function formatHandicap(value: number): string {
  // Round before choosing the sign, not after. A value of -0.04 is scratch once
  // it reaches one decimal place, and deciding on the raw number would print it
  // as "+0.0". The `+ 0` then folds the -0 that rounding produces.
  const v = Math.round(value * 10) / 10 + 0
  return v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1)
}

/**
 * Score Differentials follow the same convention as the Index they feed, so a
 * differential better than the course rating reads +3.9 rather than -3.9.
 *
 * Note this makes a good differential (+3.9) and a poor one (4.0) look alike at
 * a glance; the Stats table leans on colour to separate them.
 */
export function formatDifferential(value: number): string {
  return formatHandicap(value)
}


/**
 * A tee is identified by (gender, name), never by name alone.
 *
 * Most clubs list the same colours for men and women off different rating
 * plates, so a radio group keyed on the name alone gives two options the same
 * value — and MUI selects by value, so clicking one selects both. That is the
 * "picking White selects both layouts" bug. These two keep the encode/decode
 * in one place so the two pickers cannot drift apart.
 */
export function teeKey(tee: { name: string; gender: 'male' | 'female' }): string {
  return `${tee.gender}:${tee.name}`
}

export function parseTeeKey(key: string): { gender: 'male' | 'female'; name: string } | null {
  const idx = key.indexOf(':')
  if (idx === -1) return null
  const gender = key.slice(0, idx)
  if (gender !== 'male' && gender !== 'female') return null
  return { gender, name: key.slice(idx + 1) }
}

/**
 * The provider packs its layout id and rating system into the tee name, e.g.
 * "20102, USGA, Black, Men". Neither means anything to a golfer.
 */
export function formatTeeName(name: string): string {
  return name
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\d+$/.test(s) && s.toUpperCase() !== 'USGA')
    .join(' ')
}
