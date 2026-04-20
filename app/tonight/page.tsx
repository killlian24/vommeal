'use client'

import { useState, useEffect } from 'react'
import { format, addDays, isToday, isTomorrow } from 'date-fns'
import Image from 'next/image'
import Link from 'next/link'
import { ShoppingCart, Clock, ChevronRight } from 'lucide-react'
import { StarRating } from '@/components/StarRating'

type Recipe = { id: string; name: string; image_url: string; prep_time: number; cook_time: number; rating: number | null }
type MealEntry = { id: string; date: string; recipe_id: string | null; custom_meal_name: string | null; servings: number; recipe?: Recipe }

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  if (isToday(d)) return 'Tonight'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'EEEE')
}

export default function TonightPage() {
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const end = format(addDays(new Date(), 3), 'yyyy-MM-dd')
    fetch(`/api/meal-plan?start=${today}&end=${end}`)
      .then(r => r.json())
      .then(data => { setEntries(data); setLoading(false) })
  }, [])

  const addToList = async (date: string) => {
    setAddingDate(date)
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_date', date }),
    })
    const data = await res.json()
    setAddingDate(null)
    if (data.added > 0) {
      showToast(`Added ${data.added} ingredients from ${data.recipe_name}`)
    } else {
      showToast('Already on your list or no ingredients found')
    }
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayEntry = entries.find(e => e.date === today)
  const upcomingEntries = entries.filter(e => e.date !== today)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Tonight</h1>
        <p className="text-sm text-[#555] mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      {/* Tonight — big card */}
      {todayEntry ? (
        <div className="relative rounded-2xl border border-primary/30 overflow-hidden bg-[#141414]">
          {todayEntry.recipe?.image_url && (
            <div className="relative h-52 overflow-hidden">
              <Image src={todayEntry.recipe.image_url} alt="" fill className="object-cover" unoptimized />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent" />
            </div>
          )}
          <div className={`p-5 ${todayEntry.recipe?.image_url ? '-mt-16 relative' : ''}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Tonight</p>
            {todayEntry.recipe_id ? (
              <Link href={`/recipes/${todayEntry.recipe_id}`}
                className="text-2xl font-bold text-white leading-tight hover:text-primary transition-colors block mb-2">
                {todayEntry.recipe?.name}
              </Link>
            ) : (
              <p className="text-2xl font-bold text-white leading-tight mb-2">{todayEntry.custom_meal_name}</p>
            )}
            {todayEntry.recipe?.rating ? (
              <div className="mb-3"><StarRating rating={todayEntry.recipe.rating} size={14} /></div>
            ) : null}
            <div className="flex items-center gap-4 text-sm text-[#666] mb-4">
              {todayEntry.recipe?.prep_time ? (
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {todayEntry.recipe.prep_time + (todayEntry.recipe.cook_time || 0)} min
                </span>
              ) : null}
              <span>{todayEntry.servings} servings</span>
            </div>
            {todayEntry.recipe_id && (
              <button
                onClick={() => addToList(today)}
                disabled={addingDate === today}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                <ShoppingCart size={15} />
                {addingDate === today ? 'Adding…' : 'Add ingredients to list'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#1e1e1e] bg-[#141414] p-8 text-center">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-[#555]">Nothing planned for tonight</p>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-hover mt-3 transition-colors">
            Plan dinner <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* Upcoming — compact cards */}
      {upcomingEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#444]">Coming up</p>
          {upcomingEntries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 bg-[#141414] border border-[#1e1e1e] rounded-xl px-4 py-3">
              {entry.recipe?.image_url && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <Image src={entry.recipe.image_url} alt="" fill className="object-cover" unoptimized />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#555] font-medium">{dayLabel(entry.date)}</p>
                {entry.recipe_id ? (
                  <Link href={`/recipes/${entry.recipe_id}`}
                    className="text-sm font-semibold text-white hover:text-primary transition-colors truncate block">
                    {entry.recipe?.name}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-white truncate">{entry.custom_meal_name}</p>
                )}
              </div>
              {entry.recipe_id && (
                <button
                  onClick={() => addToList(entry.date)}
                  disabled={addingDate === entry.date}
                  title="Add ingredients to shopping list"
                  className="p-2 rounded-lg text-[#444] hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex-shrink-0"
                >
                  <ShoppingCart size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-full text-sm text-white shadow-xl animate-slide-up whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
