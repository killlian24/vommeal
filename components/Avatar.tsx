// Shared avatar: fixed colour per profile slot so both partners always
// see the same colour for the same person everywhere in the app.
// user1 (index 0) → orange, user2 (index 1) → blue, anything else → grey.

export const AVATAR_COLORS = ['#f97316', '#3b82f6'] as const
export const AVATAR_FALLBACK = '#6b7280'

export function getInitials(name: string) {
  return name.trim().split(' ')
    .filter(p => /[a-zA-ZäöüÄÖÜ]/.test(p[0] ?? ''))
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/** Colour for a profile name given the ordered profile list (user1, user2). */
export function avatarColor(name: string, users: string[]): string {
  const idx = users.indexOf(name)
  return idx >= 0 && idx < AVATAR_COLORS.length ? AVATAR_COLORS[idx] : AVATAR_FALLBACK
}

const SIZES = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-7 h-7 text-xs',
  lg: 'w-8 h-8 text-xs',
  xl: 'w-12 h-12 text-lg shadow-md',
} as const

export function Avatar({ name, users, size = 'sm', className = '' }: {
  name: string
  users: string[]
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      className={`${SIZES[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
      style={{ background: avatarColor(name, users) }}
    >
      {getInitials(name)}
    </span>
  )
}
