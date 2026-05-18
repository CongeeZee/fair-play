/**
 * Strips numeric IDs and "USGA" from course names stored in the DB.
 * e.g. "Avondale Golf Club — 20102, USGA, Black, Men Tees"
 *   -> "Avondale Golf Club — Black Men Tees"
 */
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

export function formatCourseName(name: string): string {
  const sep = ' — '
  const idx = name.indexOf(sep)
  if (idx === -1) return name

  const base = name.slice(0, idx)
  const teeRaw = name.slice(idx + sep.length).replace(/ Tees$/, '')
  const teeClean = teeRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => !/^\d+$/.test(s) && s.toUpperCase() !== 'USGA')
    .join(' ')

  return `${base} — ${teeClean} Tees`
}
