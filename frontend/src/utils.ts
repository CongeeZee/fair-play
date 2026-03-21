/**
 * Strips numeric IDs and "USGA" from course names stored in the DB.
 * e.g. "Avondale Golf Club — 20102, USGA, Black, Men Tees"
 *   -> "Avondale Golf Club — Black Men Tees"
 */
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
