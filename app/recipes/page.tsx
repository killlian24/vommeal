'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, Search, RefreshCw, Clock, Users, ExternalLink, BookOpen } from 'lucide-react'
import { StarRating } from '@/components/StarRating'

type Recipe = {
  id: string; name: string; description: string; tags: string[]
  servings: number; prep_time: number; cook_time: number
  image_url: string; source: 'local' | 'mealie'; mealie_slug: string | null
  rating: number | null
}

type FilterType = 'all' | 'local' | 'mealie'
type SyncProgress = {
  status: 'listing' | 'syncing' | 'done' | 'error'
  total?: number
  synced?: number
  current?: string
  created?: number
  errors?: number
  message?: string
  error?: string
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/recipes')
    setRecipes(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const sync = async () => {
    setSyncing(true)
    setSyncProgress({ status: 'listing', message: 'Connecting to Mealie…' })

    try {
      const res = await fetch('/api/mealie/sync', { method: 'POST' })
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (line.startsWith('data: ')) {
            try {
              const data: SyncProgress = JSON.parse(line.slice(6))
              setSyncProgress(data)
              if (data.status === 'done') {
                load()
                setTimeout(() => setSyncProgress(null), 4000)
              }
            } catch { /* ignore malformed */ }
          }
        }
      }
    } catch (e) {
      setSyncProgress({ status: 'error', error: String(e) })
      setTimeout(() => setSyncProgress(null), 5000)
    }

    setSyncing(false)
  }

  const filtered = recipes.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchFilter = filter === 'all' || r.source === filter
    return matchSearch && matchFilter
  })

  const counts = {
    all: recipes.length,
    local: recipes.filter(r => r.source === 'local').length,
    mealie: recipes.filter(r => r.source === 'mealie').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Recipes</h1>
          <p className="text-sm text-[#666] mt-0.5">{recipes.length} in your collection</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-[#888] hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync Mealie</span>
          </button>
          <Link
            href="/recipes/new"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add</span>
          </Link>
        </div>
      </div>

      {syncProgress && (
        <div className={`rounded-xl border overflow-hidden text-sm transition-all ${
          syncProgress.status === 'error'
            ? 'bg-red-500/10 border-red-500/30'
            : syncProgress.status === 'done'
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-[#141414] border-[#2a2a2a]'
        }`}>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {syncProgress.status === 'error' ? (
                <span className="text-red-400">✗ {syncProgress.error}</span>
              ) : syncProgress.status === 'done' ? (
                <span className="text-green-400">
                  ✓ Done — {syncProgress.created} new, {syncProgress.synced} updated
                  {(syncProgress.errors ?? 0) > 0 && `, ${syncProgress.errors} failed`}
                </span>
              ) : (
                <>
                  <RefreshCw size={13} className="animate-spin text-primary flex-shrink-0" />
                  <span className="text-[#888] truncate">
                    {syncProgress.status === 'listing'
                      ? (syncProgress.message ?? 'Fetching list…')
                      : `${syncProgress.current ?? '…'}`}
                  </span>
                </>
              )}
            </div>
            {syncProgress.status === 'syncing' && syncProgress.total && (
              <span className="text-xs font-mono text-primary font-semibold flex-shrink-0 tabular-nums">
                {syncProgress.synced}/{syncProgress.total}
              </span>
            )}
          </div>
          {syncProgress.status === 'syncing' && syncProgress.total && (
            <div className="h-0.5 bg-[#1e1e1e]">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((syncProgress.synced ?? 0) / syncProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
          <input
            placeholder="Search recipes or tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#141414] border border-[#222] rounded-lg p-1">
          {(['all', 'local', 'mealie'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                filter === f ? 'bg-primary/20 text-primary' : 'text-[#666] hover:text-white'
              }`}
            >
              {f} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={40} className="mx-auto text-[#333] mb-3" />
          <p className="text-[#555]">{search ? 'No recipes match your search' : 'No recipes yet'}</p>
          {!search ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={sync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                Sync from Mealie →
              </button>
              <Link href="/recipes/new" className="text-xs text-[#555] hover:text-white transition-colors">
                or add a local recipe
              </Link>
            </div>
          ) : (
            <p className="text-xs text-[#444] mt-1">Try a different search term</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(recipe => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="group bg-[#141414] border border-[#1e1e1e] hover:border-[#2d2d2d] rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30"
            >
              {/* Image */}
              <div className="relative h-28 overflow-hidden">
                {recipe.image_url ? (
                  <>
                    <Image
                      src={recipe.image_url}
                      alt={recipe.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl"
                    style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(30,18,8,1) 70%)' }}>
                    🍽️
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-white leading-tight line-clamp-1 mb-1.5">{recipe.name}</h3>
                <div className="flex items-center gap-2 text-[10px] text-[#555]">
                  {(recipe.prep_time + recipe.cook_time) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {recipe.prep_time + recipe.cook_time}m
                    </span>
                  )}
                  {recipe.servings > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Users size={10} />
                      {recipe.servings}
                    </span>
                  )}
                  {recipe.rating ? <StarRating rating={recipe.rating} size={13} /> : null}
                  {recipe.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="bg-[#1e1e1e] px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
