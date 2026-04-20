'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, addDays, isToday, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, Search, ShoppingCart, ThumbsUp, RefreshCw, Zap, Dices, Heart, XCircle, PackagePlus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { StarRating } from '@/components/StarRating'

type Recipe = { id: string; name: string; image_url: string; prep_time: number; cook_time: number; source: string; rating: number | null }
type Nomination = { id: string; date: string; recipe_id: string; user_name: string; recipe?: Recipe }
type MealEntry = {
  id: string; date: string; meal_type: 'dinner'
  recipe_id: string | null; custom_meal_name: string | null
  servings: number; notes: string
  status: 'suggested' | 'approved'; suggested_by: string
  recipe?: Recipe
}

function getInitials(name: string) {
  return name.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#f59e0b']
  const color = colors[name.charCodeAt(0) % colors.length]
  const sz = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
  return (
    <span className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0`} style={{ background: color }}>
      {getInitials(name)}
    </span>
  )
}

export default function PlanPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [entries, setEntries] = useState<MealEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<{ date: string; replaceId?: string } | null>(null)
  const [search, setSearch] = useState('')
  const [customName, setCustomName] = useState('')
  const [servings, setServings] = useState(2)
  const [toast, setToast] = useState('')
  const [autofilling, setAutofilling] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [users, setUsers] = useState<string[]>([])
  const [showUserPicker, setShowUserPicker] = useState(false)
  // Fun mode
  const [funMode, setFunMode] = useState(false)
  const [nominations, setNominations] = useState<Nomination[]>([])
  const [funDayIndex, setFunDayIndex] = useState(0)
  const [funCardIndex, setFunCardIndex] = useState(0)
  const [funDone, setFunDone] = useState(false)
  const [funVotes, setFunVotes] = useState<Record<string, Record<string, boolean>>>({})
  const [settleDate, setSettleDate] = useState<string | null>(null)
  const [addingToList, setAddingToList] = useState<string | null>(null)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const addToList = async (date: string) => {
    setAddingToList(date)
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_date', date }),
    })
    const data = await res.json()
    setAddingToList(null)
    showToast(data.added > 0 ? `Added ${data.added} ingredients` : 'Already on your list')
  }

  // Load users + resolve identity from #hash or localStorage
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      const u = [s.user1_name, s.user2_name].filter(Boolean)
      setUsers(u)

      // Hash takes priority: /#susi or /#kilian
      const hash = window.location.hash.replace('#', '').trim().toLowerCase()
      const fromHash = u.find(name => name.toLowerCase() === hash)
      if (fromHash) {
        setCurrentUser(fromHash)
        localStorage.setItem('vommeal_user', fromHash)
        return
      }

      // Fall back to localStorage
      const stored = localStorage.getItem('vommeal_user')
      if (stored && u.includes(stored)) {
        setCurrentUser(stored)
      } else if (u.length > 0) {
        setShowUserPicker(true)
      }
    })
    fetch('/api/recipes').then(r => r.json()).then(setRecipes)
  }, [])

  const selectUser = (name: string) => {
    setCurrentUser(name)
    localStorage.setItem('vommeal_user', name)
    setShowUserPicker(false)
  }

  const switchUser = () => {
    const other = users.find(u => u !== currentUser)
    if (other) selectUser(other)
  }

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/meal-plan?start=${startStr}&end=${endStr}`)
    setEntries(await res.json())
    setLoading(false)
  }, [startStr, endStr])

  const loadNominations = useCallback(async () => {
    const res = await fetch(`/api/nominations?start=${startStr}&end=${endStr}`)
    if (res.ok) setNominations(await res.json())
  }, [startStr, endStr])

  useEffect(() => { loadEntries(); loadNominations() }, [loadEntries, loadNominations])

  const CARDS_PER_DAY = 5

  // Deterministic shuffle seeded by a string — both partners get same 5 cards per day
  function seededShuffle<T>(arr: T[], seed: string): T[] {
    const copy = [...arr]
    let h = 0
    for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0 }
    for (let i = copy.length - 1; i > 0; i--) {
      h = Math.imul(1664525, h) + 1013904223 | 0
      const j = Math.abs(h) % (i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  // Get the N recipes for a given date (same for both partners)
  const getCardsForDate = (dateStr: string): Recipe[] =>
    seededShuffle(recipes, dateStr).slice(0, CARDS_PER_DAY)

  const openFunMode = () => {
    if (!currentUser) { showToast('Pick a profile first'); return }
    setFunDayIndex(0)
    setFunCardIndex(0)
    setFunDone(false)
    setFunVotes({})
    setFunMode(true)
  }

  const getEntry = (date: Date) =>
    entries.find(e => e.date === format(date, 'yyyy-MM-dd'))

  const addEntry = async (recipeId?: string, name?: string) => {
    if (!adding) return
    // If replacing, delete old entry first
    if (adding.replaceId) {
      await fetch(`/api/meal-plan/${adding.replaceId}`, { method: 'DELETE' })
    }
    await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: adding.date, meal_type: 'dinner',
        recipe_id: recipeId || null,
        custom_meal_name: name || customName || null,
        servings,
        status: 'suggested',
        suggested_by: currentUser,
      }),
    })
    setAdding(null); setCustomName(''); setSearch(''); setServings(2)
    loadEntries()
    showToast(adding.replaceId ? 'Counter-suggestion added!' : 'Dinner suggestion added!')
  }

  const approve = async (id: string) => {
    await fetch(`/api/meal-plan/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'approved' } : e))
    showToast('Dinner approved! 🎉')
  }

  const removeEntry = async (id: string) => {
    if (!confirm('Remove this meal?')) return
    await fetch(`/api/meal-plan/${id}`, { method: 'DELETE' })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  // Fun mode: days without a confirmed meal, in current week
  const funDays = days.filter(d => !entries.find(e => e.date === format(d, 'yyyy-MM-dd')))

  const advanceFunCard = (newVotes: typeof funVotes) => {
    const nextCard = funCardIndex + 1
    if (nextCard >= CARDS_PER_DAY) {
      // Done with this day — move to next
      const nextDay = funDayIndex + 1
      if (nextDay >= funDays.length) {
        // All days voted — submit and show results
        submitFunVotes(newVotes)
      } else {
        setFunDayIndex(nextDay)
        setFunCardIndex(0)
      }
    } else {
      setFunCardIndex(nextCard)
    }
  }

  const funVote = (recipe: Recipe, yes: boolean) => {
    const dateStr = format(funDays[funDayIndex], 'yyyy-MM-dd')
    const newVotes = {
      ...funVotes,
      [dateStr]: { ...(funVotes[dateStr] || {}), [recipe.id]: yes },
    }
    setFunVotes(newVotes)
    advanceFunCard(newVotes)
  }

  const submitFunVotes = async (votes: typeof funVotes) => {
    // Submit all yes-votes as nominations
    const posts = []
    for (const [date, dayVotes] of Object.entries(votes)) {
      for (const [recipeId, yes] of Object.entries(dayVotes)) {
        if (yes) {
          posts.push(fetch('/api/nominations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, recipe_id: recipeId, user_name: currentUser }),
          }))
        }
      }
    }
    await Promise.allSettled(posts)
    await loadEntries()
    await loadNominations()
    setFunDone(true)
  }

  const autofillWeek = async () => {
    if (!currentUser) { showToast('Pick a profile first'); return }
    setAutofilling(true)
    const res = await fetch('/api/meal-plan/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: startStr, end: endStr, suggested_by: currentUser }),
    })
    const data = await res.json()
    if (data.ok) {
      if (data.filled === 0) showToast('All days already planned!')
      else { showToast(`Filled ${data.filled} day${data.filled === 1 ? '' : 's'} — your partner can now approve`); loadEntries(); loadNominations() }
    } else {
      showToast(data.error || 'Could not fill week')
    }
    setAutofilling(false)
  }

  const resolveConflict = async (dateStr: string, recipeId: string) => {
    await fetch('/api/nominations/pick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, recipe_id: recipeId }),
    })
    await loadEntries()
    await loadNominations()
    setSettleDate(null)
  }

  const generateShopping = async () => {
    const res = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', start: startStr, end: endStr }),
    })
    const data = await res.json()
    showToast(`Added ${data.added} ingredients to shopping list`)
  }

  const filteredRecipes = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  const partner = users.find(u => u !== currentUser) || 'Partner'
  const mySuggestions = entries.filter(e => e.status === 'suggested' && e.suggested_by === currentUser).length
  const pendingForMe = entries.filter(e => e.status === 'suggested' && e.suggested_by !== currentUser).length

  return (
    <div className="space-y-6">
      {/* Who are you? — full-screen picker */}
      {showUserPicker && users.length > 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]">
          {/* Subtle radial glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(249,115,22,0.08) 0%, transparent 70%)'
          }} />

          <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-sm animate-slide-up">
            {/* App mark */}
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-8 shadow-lg shadow-primary/20">
              <span className="text-xl">🍽️</span>
            </div>

            <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Hey, who's cooking?</h1>
            <p className="text-sm text-[#555] mb-10">
              Tip: bookmark <span className="text-[#888] font-mono">/#yourname</span> to skip this
            </p>

            {/* Profile cards */}
            <div className="w-full space-y-3">
              {users.map((u, i) => {
                const colors = [
                  { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', avatar: '#f97316', glow: 'rgba(249,115,22,0.15)' },
                  { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', avatar: '#3b82f6', glow: 'rgba(59,130,246,0.15)' },
                ]
                const c = colors[i % colors.length]
                return (
                  <button key={u} onClick={() => selectUser(u)}
                    className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: c.bg, border: `1px solid ${c.border}`, boxShadow: `0 0 24px ${c.glow}` }}>
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0 shadow-md"
                      style={{ background: c.avatar }}>
                      {getInitials(u)}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-base font-semibold text-white">{u}</p>
                      <p className="text-xs text-[#555] mt-0.5">Continue as {u}</p>
                    </div>
                    <span className="text-[#555] group-hover:text-white transition-colors text-lg">→</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">This Week</h1>
            <p className="text-sm text-[#555] mt-0.5">
              {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}
            </p>
          </div>
          {pendingForMe > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold border border-primary/30">
              {pendingForMe} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* User switcher */}
          {currentUser && (
            <button onClick={switchUser} title={`Switch to ${partner}`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] transition-all">
              <Avatar name={currentUser} />
              <span className="text-xs text-[#888] hidden sm:inline">{currentUser}</span>
              <RefreshCw size={11} className="text-[#555]" />
            </button>
          )}
          <button onClick={openFunMode}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-[#888] hover:text-pink-400 transition-all"
            title="Fun mode — pick meals together">
            <Dices size={15} />
          </button>
          <button onClick={autofillWeek} disabled={autofilling}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-[#888] hover:text-primary transition-all disabled:opacity-50"
            title="Fill empty days automatically">
            <Zap size={15} className={autofilling ? 'animate-pulse' : ''} />
          </button>
          <button onClick={generateShopping}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-[#888] hover:text-white transition-all"
            title="Add this week's ingredients to shopping list">
            <ShoppingCart size={15} />
          </button>
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-2 rounded-lg hover:bg-[#1c1c1c] text-[#555] hover:text-white transition-all">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1c1c1c] hover:bg-[#252525] text-[#666] hover:text-white transition-all border border-[#2a2a2a]">
            Today
          </button>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-2 rounded-lg hover:bg-[#1c1c1c] text-[#555] hover:text-white transition-all">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {days.map(day => {
          const entry = getEntry(day)
          const dateStr = format(day, 'yyyy-MM-dd')
          const today = isToday(day)
          const isMyEntry = !!currentUser && entry?.suggested_by === currentUser
          // Only show voting controls if we know who we are AND we didn't suggest it
          const isPendingForMe = entry?.status === 'suggested' && !!currentUser && !isMyEntry
          const isApproved = entry?.status === 'approved'
          const isMySuggestion = entry?.status === 'suggested' && isMyEntry

          return (
            <div key={dateStr} className={`relative rounded-2xl border overflow-hidden transition-all ${
              today ? 'border-primary/40' : 'border-[#1e1e1e]'
            } ${isPendingForMe ? 'ring-1 ring-primary/30' : ''}`}>
              {/* Day header */}
              <div className={`px-3 py-2 flex items-center justify-between border-b border-[#1a1a1a] ${
                today ? 'bg-primary/10' : 'bg-[#111]'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${today ? 'text-primary' : 'text-[#555]'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-bold ${today ? 'text-primary' : 'text-[#777]'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
                {entry && (
                  <div className="flex items-center gap-1.5">
                    {isApproved && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 font-medium">✓ set</span>
                    )}
                    {isMySuggestion && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">waiting…</span>
                    )}
                    {isPendingForMe && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium animate-pulse">vote!</span>
                    )}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="bg-[#141414] min-h-[110px]">
                {loading ? (
                  <div className="p-3"><div className="skeleton h-16 rounded-lg" /></div>
                ) : entry ? (
                  <div className="relative group">
                    {/* Recipe image */}
                    {entry.recipe?.image_url && (
                      <div className="relative h-24 overflow-hidden">
                        <Image src={entry.recipe.image_url} alt="" fill className="object-cover" unoptimized />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/30 to-transparent" />
                      </div>
                    )}

                    <div className={`p-3 ${entry.recipe?.image_url ? '-mt-6 relative' : ''}`}>
                      {entry.recipe_id ? (
                        <Link href={`/recipes/${entry.recipe_id}`}
                          className="text-sm font-semibold text-white leading-tight mb-1.5 hover:text-primary transition-colors line-clamp-2 block">
                          {entry.recipe?.name}
                        </Link>
                      ) : (
                        <p className="text-sm font-semibold text-white leading-tight mb-1.5">
                          {entry.custom_meal_name}
                        </p>
                      )}

                      {/* Rating */}
                      {entry.recipe?.rating ? (
                        <div className="mb-1.5">
                          <StarRating rating={entry.recipe.rating} size={11} />
                        </div>
                      ) : null}

                      {/* Suggested by — only show when we know who suggested it */}
                      {entry.suggested_by && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <Avatar name={entry.suggested_by} />
                          <span className="text-[11px] text-[#555]">{entry.suggested_by}</span>
                        </div>
                      )}

                      {/* Voting actions */}
                      {isPendingForMe && (
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => approve(entry.id)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium border border-green-500/20 transition-all">
                            <ThumbsUp size={11} />
                            Yes!
                          </button>
                          <button onClick={() => { setAdding({ date: dateStr, replaceId: entry.id }); setServings(2) }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] text-[#888] hover:text-white text-xs font-medium border border-[#2a2a2a] transition-all">
                            <RefreshCw size={11} />
                            Other?
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action buttons (visible on hover) */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                      {entry.recipe_id && (
                        <button
                          onClick={() => addToList(dateStr)}
                          disabled={addingToList === dateStr}
                          title="Add ingredients to shopping list"
                          className="p-1 rounded-lg bg-black/50 text-[#888] hover:text-primary transition-all disabled:opacity-50"
                        >
                          <PackagePlus size={12} />
                        </button>
                      )}
                      <button onClick={() => removeEntry(entry.id)}
                        className="p-1 rounded-lg bg-black/50 text-[#666] hover:text-red-400 transition-all">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (() => {
                  const dayNoms = nominations.filter(n => n.date === dateStr)
                  const myNoms = dayNoms.filter(n => n.user_name === currentUser)
                  const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
                  const hasNoms = dayNoms.length > 0
                  const myIds = new Set(myNoms.map(n => n.recipe_id))
                  const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
                  const hasMatch = myNoms.some(n => partnerIds.has(n.recipe_id))
                  const bothVoted = myNoms.length > 0 && partnerNoms.length > 0
                  return hasNoms ? (
                    <div className="p-3">
                      {myNoms.length > 0 && (
                        <div className="mb-1.5">
                          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">Your picks</p>
                          {myNoms.slice(0, 2).map(n => (
                            <p key={n.id} className="text-xs text-green-400 truncate">✓ {n.recipe?.name}</p>
                          ))}
                        </div>
                      )}
                      {partnerNoms.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">{users.find(u => u !== currentUser) || 'Partner'}'s picks</p>
                          {partnerNoms.slice(0, 2).map(n => (
                            <p key={n.id} className="text-xs text-blue-400 truncate">✓ {n.recipe?.name}</p>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5 mt-1">
                        {bothVoted && !hasMatch && (
                          <button onClick={() => setSettleDate(dateStr)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 text-xs font-medium transition-all">
                            ⚖️ Settle
                          </button>
                        )}
                        {bothVoted && hasMatch && (
                          <button onClick={() => setSettleDate(dateStr)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/25 text-pink-400 text-xs font-medium transition-all">
                            ❤️ Match!
                          </button>
                        )}
                        <button onClick={() => { setAdding({ date: dateStr }); setServings(2) }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#222] border border-[#2a2a2a] text-[#555] hover:text-white text-xs transition-all">
                          <Plus size={11} /> Manual
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAdding({ date: dateStr }); setServings(2) }}
                      className="w-full h-full min-h-[110px] flex flex-col items-center justify-center gap-1.5 text-[#333] hover:text-[#555] hover:bg-[#181818] transition-all"
                    >
                      <Plus size={18} />
                      <span className="text-xs">Suggest dinner</span>
                    </button>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add / suggest modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-[#222]">
              <div>
                <p className="font-semibold text-white">
                  {adding.replaceId ? 'Suggest something else' : 'Suggest dinner'}
                </p>
                <p className="text-xs text-[#555] mt-0.5">{format(parseISO(adding.date), 'EEEE, MMM d')}</p>
              </div>
              <button onClick={() => { setAdding(null); setSearch(''); setCustomName('') }}
                className="p-1.5 rounded-lg hover:bg-[#222] text-[#555] hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Servings */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#666]">Servings</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setServings(s => Math.max(1, s - 1))} className="w-7 h-7 rounded-full bg-[#222] hover:bg-[#333] text-white flex items-center justify-center transition-all">−</button>
                  <span className="w-6 text-center text-sm font-medium">{servings}</span>
                  <button onClick={() => setServings(s => s + 1)} className="w-7 h-7 rounded-full bg-[#222] hover:bg-[#333] text-white flex items-center justify-center transition-all">+</button>
                </div>
              </div>

              {/* Custom name */}
              <input placeholder="Type a meal name…" value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && customName && addEntry()}
                className="text-sm" />
              {customName && (
                <button onClick={() => addEntry()}
                  className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">
                  Suggest "{customName}"
                </button>
              )}

              {/* Recipe search */}
              {!customName && (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
                    <input placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)} autoFocus className="pl-8 text-sm" />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    {filteredRecipes.length === 0 && <p className="text-center text-[#555] text-sm py-4">No recipes found</p>}
                    {filteredRecipes.map(r => (
                      <button key={r.id} onClick={() => addEntry(r.id)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#1e1e1e] border border-transparent hover:border-[#2a2a2a] text-left transition-all">
                        {r.image_url
                          ? <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 relative"><Image src={r.image_url} alt="" fill className="object-cover" unoptimized /></div>
                          : <div className="w-9 h-9 rounded-md bg-[#222] flex-shrink-0 flex items-center justify-center">🍽️</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{r.name}</p>
                          <p className="text-[11px] text-[#555]">
                            {r.source === 'mealie' ? '📌 Mealie' : '📝 Local'}
                            {(r.prep_time || r.cook_time) ? ` · ${(r.prep_time || 0) + (r.cook_time || 0)} min` : ''}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fun mode overlay */}
      {funMode && (() => {
        // Use funDays (computed at render) — same source of truth as the voting logic
        const emptyDays = funDays

        // All days already planned
        if (emptyDays.length === 0) return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 max-w-sm w-full text-center">
              <div className="text-4xl mb-4">🎉</div>
              <p className="text-white font-semibold text-lg">All days planned!</p>
              <p className="text-[#555] text-sm mt-1 mb-6">Nothing left to vote on this week.</p>
              <button onClick={() => setFunMode(false)} className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-medium">Done</button>
            </div>
          </div>
        )

        // Results screen — show after voting all days
        if (funDone) {
          // Group nominations by date for display
          const byDate = emptyDays.map(d => {
            const dateStr = format(d, 'yyyy-MM-dd')
            const dayNoms = nominations.filter(n => n.date === dateStr)
            const myNoms = dayNoms.filter(n => n.user_name === currentUser)
            const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
            const myIds = new Set(myNoms.map(n => n.recipe_id))
            const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
            const matchId = myNoms.find(n => partnerIds.has(n.recipe_id))?.recipe_id
            const confirmed = entries.find(e => e.date === dateStr)
            return { dateStr, day: d, myNoms, partnerNoms, matchId, confirmed }
          })

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl animate-slide-up max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] flex-shrink-0">
                  <p className="font-semibold text-white">Your votes</p>
                  <button onClick={() => setFunMode(false)} className="p-1.5 rounded-lg hover:bg-[#222] text-[#555] hover:text-white transition-all"><X size={15} /></button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-[#1a1a1a]">
                  {byDate.map(({ dateStr, day, myNoms, partnerNoms, matchId, confirmed }) => {
                    const isConfirmed = !!confirmed
                    return (
                      <div key={dateStr} className="px-4 py-3">
                        <p className="text-xs text-[#555] font-medium mb-2">{format(day, 'EEEE, MMM d')}</p>
                        {isConfirmed ? (
                          <div className="flex items-center gap-2 text-green-400 text-sm">
                            <span>✓</span>
                            <span className="font-medium">{confirmed.recipe?.name || confirmed.custom_meal_name}</span>
                          </div>
                        ) : myNoms.length === 0 && partnerNoms.length === 0 ? (
                          <p className="text-xs text-[#444]">No votes yet for this day</p>
                        ) : matchId ? (
                          <div className="flex items-center gap-2 text-pink-400 text-sm">
                            <Heart size={12} className="fill-pink-400 flex-shrink-0" />
                            <span className="font-medium">{myNoms.find(n => n.recipe_id === matchId)?.recipe?.name}</span>
                            <span className="text-[10px] text-[#555]">match!</span>
                          </div>
                        ) : (
                          // Conflict — show both sides, let user pick
                          <div className="space-y-2">
                            <p className="text-[11px] text-amber-400">No match — pick one:</p>
                            {[...myNoms, ...partnerNoms.filter(n => !myNoms.find(m => m.recipe_id === n.recipe_id))].slice(0, 4).map(n => (
                              <button key={n.id} onClick={() => resolveConflict(dateStr, n.recipe_id)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-left transition-all">
                                {n.recipe?.image_url
                                  ? <div className="w-7 h-7 rounded flex-shrink-0 overflow-hidden relative"><Image src={n.recipe.image_url} alt="" fill className="object-cover" unoptimized /></div>
                                  : <div className="w-7 h-7 rounded bg-[#333] flex-shrink-0 flex items-center justify-center text-sm">🍽️</div>
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white font-medium truncate">{n.recipe?.name}</p>
                                  <p className="text-[10px] text-[#555]">
                                    {myNoms.find(m => m.recipe_id === n.recipe_id) ? 'your pick' : `${users.find(u => u !== currentUser) || 'partner'}'s pick`}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="px-4 py-3 border-t border-[#1a1a1a] flex-shrink-0">
                  <button onClick={() => setFunMode(false)} className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all">Done</button>
                </div>
              </div>
            </div>
          )
        }

        // Voting screen
        const currentDay = emptyDays[Math.min(funDayIndex, emptyDays.length - 1)]
        const dateStr = format(currentDay, 'yyyy-MM-dd')
        const cards = getCardsForDate(dateStr)
        const recipe = cards[funCardIndex]
        const myVotesForDay = funVotes[dateStr] || {}
        // Don't reveal partner votes during voting — only shown in results screen
        const partnerLikesThis = false

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
                <div>
                  <p className="text-xs text-[#555] font-medium uppercase tracking-wider">
                    {funDayIndex + 1}/{emptyDays.length} days · card {funCardIndex + 1}/{CARDS_PER_DAY}
                  </p>
                  <p className="text-sm font-semibold text-white">{format(currentDay, 'EEEE, MMM d')}</p>
                </div>
                <button onClick={() => setFunMode(false)} className="p-1.5 rounded-lg hover:bg-[#222] text-[#555] hover:text-white transition-all">
                  <X size={15} />
                </button>
              </div>

              {/* Progress dots */}
              <div className="flex gap-1 px-4 pt-2">
                {cards.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                    i < funCardIndex ? 'bg-primary' : i === funCardIndex ? 'bg-primary/50' : 'bg-[#222]'
                  }`} />
                ))}
              </div>

              {/* Recipe card */}
              {recipe && (
                <>
                  <div className="relative">
                    {recipe.image_url ? (
                      <div className="relative h-48 overflow-hidden">
                        <Image src={recipe.image_url} alt="" fill className="object-cover" unoptimized />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                        {partnerLikesThis && (
                          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-pink-500/20 border border-pink-500/40 backdrop-blur-sm">
                            <Heart size={11} className="text-pink-400 fill-pink-400" />
                            <span className="text-xs text-pink-300 font-medium">{users.find(u => u !== currentUser)} likes this!</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-28 bg-[#1a1a1a] flex items-center justify-center text-5xl">🍽️</div>
                    )}
                    <div className="px-4 py-3">
                      <p className="text-base font-semibold text-white leading-tight">{recipe.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#555]">
                        {(recipe.prep_time || recipe.cook_time) && <span>⏱ {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min</span>}
                        {recipe.rating ? <span>⭐ {recipe.rating}</span> : null}
                      </div>
                    </div>
                  </div>

                  {/* Voting buttons */}
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    <button onClick={() => funVote(recipe, false)}
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1c1c1c] hover:bg-red-500/10 border border-[#2a2a2a] hover:border-red-500/30 text-[#555] hover:text-red-400 transition-all text-sm font-medium">
                      <XCircle size={18} /> Nope
                    </button>
                    <button onClick={() => funVote(recipe, true)}
                      className={`flex items-center justify-center gap-2 py-3.5 rounded-xl border transition-all text-sm font-medium ${
                        partnerLikesThis
                          ? 'bg-pink-500/20 border-pink-500/40 text-pink-300 hover:bg-pink-500/30'
                          : 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25'
                      }`}>
                      <Heart size={18} className={partnerLikesThis ? 'fill-pink-400' : ''} />
                      {partnerLikesThis ? 'Match!' : 'Yes!'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Settle modal */}
      {settleDate && (() => {
        const dayNoms = nominations.filter(n => n.date === settleDate)
        const myNoms = dayNoms.filter(n => n.user_name === currentUser)
        const partnerNoms = dayNoms.filter(n => n.user_name !== currentUser)
        const partnerIds = new Set(partnerNoms.map(n => n.recipe_id))
        const matchNom = myNoms.find(n => partnerIds.has(n.recipe_id))
        // All unique picks, matches first
        const allPicks = [
          ...dayNoms.filter(n => partnerIds.has(n.recipe_id) && myNoms.find(m => m.recipe_id === n.recipe_id)).slice(0, 1),
          ...myNoms.filter(n => !partnerIds.has(n.recipe_id)),
          ...partnerNoms.filter(n => !myNoms.find(m => m.recipe_id === n.recipe_id)),
        ].filter((n, i, arr) => arr.findIndex(x => x.recipe_id === n.recipe_id) === i)
        const settleDay = days.find(d => format(d, 'yyyy-MM-dd') === settleDate)
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-[#141414] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
                <div>
                  <p className="font-semibold text-white">
                    {matchNom ? '❤️ You both liked this!' : '⚖️ No match — pick one'}
                  </p>
                  {settleDay && <p className="text-xs text-[#555] mt-0.5">{format(settleDay, 'EEEE, MMM d')}</p>}
                </div>
                <button onClick={() => setSettleDate(null)} className="p-1.5 rounded-lg hover:bg-[#222] text-[#555] hover:text-white transition-all">
                  <X size={15} />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {allPicks.map(n => {
                  const isMine = !!myNoms.find(m => m.recipe_id === n.recipe_id)
                  const isPartners = partnerIds.has(n.recipe_id)
                  const isMatch = isMine && isPartners
                  return (
                    <button key={n.recipe_id} onClick={() => resolveConflict(settleDate, n.recipe_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        isMatch
                          ? 'bg-pink-500/15 border-pink-500/30 hover:bg-pink-500/25'
                          : 'bg-[#1c1c1c] border-[#2a2a2a] hover:bg-[#252525]'
                      }`}>
                      {n.recipe?.image_url
                        ? <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden relative"><Image src={n.recipe.image_url} alt="" fill className="object-cover" unoptimized /></div>
                        : <div className="w-10 h-10 rounded-lg bg-[#333] flex-shrink-0 flex items-center justify-center text-lg">🍽️</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{n.recipe?.name}</p>
                        <p className="text-[11px] text-[#555]">
                          {isMatch ? '❤️ both of you' : isMine ? 'your pick' : `${users.find(u => u !== currentUser) || 'partner'}'s pick`}
                        </p>
                      </div>
                      {isMatch && <Heart size={14} className="text-pink-400 fill-pink-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#1e1e1e] border border-[#333] rounded-full text-sm text-white shadow-xl animate-slide-up whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
