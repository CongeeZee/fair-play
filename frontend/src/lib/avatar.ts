/**
 * White initials sit on these, so each clears 4.5:1 against white. The same
 * user always gets the same colour, which is what lets you spot a friend in a
 * list before you read their name.
 */
const AVATAR_COLORS = ['#2c6347', '#3e7357', '#7a5d18', '#4a6c88', '#8b4513', '#5c3d8f', '#00695c', '#8c342a']

export function avatarColor(userId: number): string {
  return AVATAR_COLORS[Math.abs(userId) % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
