'use client'

import { useState } from 'react'

type Props = {
  rating: number | null
  max?: number
  size?: number
  editable?: boolean
  onChange?: (rating: number) => void
}

export function StarRating({ rating, max = 5, size = 12, editable = false, onChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)

  const active = hovered ?? rating ?? 0

  if (!editable && (!rating || rating === 0)) return null

  return (
    <span className="inline-flex items-center gap-px">
      {Array.from({ length: max }, (_, i) => {
        const val = i + 1
        const filled = val <= active
        const star = (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={filled ? '#f97316' : 'none'}
            stroke={filled ? '#f97316' : '#444'}
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
            type="button"
            aria-label={val === rating ? `Clear ${val} star rating` : `Set ${val} star rating`}
            className="p-1 -m-1 rounded focus-visible:outline-primary"
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
