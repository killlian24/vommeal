'use client'

import { useRef, useState } from 'react'

type Props = {
  rating: number | null
  max?: number
  size?: number
  editable?: boolean
  onChange?: (rating: number) => void
}

export function StarRating({ rating, max = 5, size = 12, editable = false, onChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const active = hovered ?? rating ?? 0

  if (!editable && (!rating || rating === 0)) return null

  // Editable: a radio group, arrow keys move and rate (one tab stop)
  const current = rating ?? 0
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!step || !onChange) return
    e.preventDefault()
    const next = Math.min(max, Math.max(1, (current || (step > 0 ? 0 : max + 1)) + step))
    if (next !== current) onChange(next)
    buttons.current[next - 1]?.focus()
  }

  return (
    <span
      className="inline-flex items-center gap-px"
      role={editable ? 'radiogroup' : 'img'}
      aria-label={editable ? 'Bewertung' : `${rating} von ${max} Sternen`}
      onKeyDown={editable ? onKeyDown : undefined}
    >
      {Array.from({ length: max }, (_, i) => {
        const val = i + 1
        const filled = val <= active
        const star = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? '#f97316' : 'none'}
            stroke={filled ? '#f97316' : '#767676'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )
        if (!editable) return <span key={i}>{star}</span>
        return (
          <button
            key={i}
            ref={el => { buttons.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={val === current}
            tabIndex={val === (current || 1) ? 0 : -1}
            aria-label={`${val} von ${max} ${max === 1 ? 'Stern' : 'Sternen'}`}
            // Tapping the current rating again removes it
            title={val === current ? 'Nochmal tippen: Bewertung entfernen' : undefined}
            // At least 40 px touch area per star; the negative margins keep the
            // visual spacing tight while the hit areas overlap slightly.
            className="p-2.5 -mx-1 -my-2 rounded focus-visible:outline-primary"
            onMouseEnter={() => setHovered(val)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(val)}
            onBlur={() => setHovered(null)}
            onClick={onChange ? () => onChange(val === rating ? 0 : val) : undefined}
          >
            {star}
          </button>
        )
      })}
    </span>
  )
}
