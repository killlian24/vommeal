'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Plus, Search, RefreshCw, Clock, BookOpen, Link2, Loader2, Zap, ChefHat } from 'lucide-react'
import { StarRating } from '@/components/StarRating'
import { track } from '@/lib/track'
import { importRecipe, extractFirstUrl } from '@/lib/recipeImport'

type Effort = 'quick' | 'involved' | null
type Recipe = {
  id: string; name: string; description: string; tags: string[]
  servings: number; prep_time: number; cook_time: number
  image_url: string; source: 'local' | 'mealie'; mealie_slug: string | null
  rating: number | null; effort?: Effort
}

type EffortFilter = 'all' | 'quick' | 'involved'
const EFFORT_FILTERS: { key: EffortFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'quick', label: 'Schnell' },
  { key: 'involved', label: 'Aufwändig' },
]

type SyncProgress = {
  status: 'listing' | 'syncing' | 'done' | 'error'
  total?: number
  synced?: number
  current?: string
  created?: number
  removed?: number
  removalSkipped?: string
  errors?: number
  failed?: { slug: string; error: string }[]
  message?: string
  error?: string
}

// Mealie offline or image gone: show the card background instead of a broken-image glyph.
const hideBrokenImage = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden' }

function EffortBadge({ effort }: { effort?: Effort }) {
  if (effort === 'quick') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/60 text-green-300 backdrop-blur-sm">
        <Zap size={10} /> Schnell
      </span>
    )
  }
  if (effort === 'involved') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/60 text-amber-300 backdrop-blur-sm">
        <ChefHat size={10} /> Aufwändig
      </span>
    )
  }
  return null
}

export default function RecipesPage() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [effortFilter, setEffortFilter] = useState<EffortFilter>('all')
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recipes')
      if (res.ok) setRecipes(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importUrl.trim()) return
    const url = extractFirstUrl(importUrl)
    if (!url) {
      setImportError('Das sieht nicht nach einem Link aus. Er sollte mit https:// beginnen.')
      return
    }
    setImporting(true)
    setImportError('')
    const result = await importRecipe(url)
    track('recipe_import', { source: 'paste', ok: 'id' in result })
    if ('id' in result) {
      router.push(`/recipes/${result.id}`)
      return // keep the loading state until the page changes
    }
    setImporting(false)
    setImportError(result.error)
  }

  const sync = async () => {
    setSyncing(true)
    setSyncProgress({ status: 'listing', message: 'Verbinde mit Mealie…' })

    try {
      const res = await fetch('/api/mealie/sync', { method: 'POST' })
      if (!res.body) throw new Error('Keine Antwort vom Server')

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
                setTimeout(() => setSyncProgress(null), (data.errors ?? 0) > 0 ? 12000 : 4000)
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

  const q = search.toLowerCase()
  const matchesSearch = (r: Recipe) =>
    r.name.toLowerCase().includes(q) || r.tags.some(t => t.toLowerCase().includes(q))
  const searched = recipes.filter(matchesSearch)
  const filtered = searched.filter(r => effortFilter === 'all' || r.effort === effortFilter)

  const counts: Record<EffortFilter, number> = {
    all: searched.length,
    quick: searched.filter(r => r.effort === 'quick').length,
    involved: searched.filter(r => r.effort === 'involved').length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Rezepte</h1>
          <p className="text-sm text-ink-muted mt-0.5">{recipes.length} in eurer Sammlung</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={sync}
            disabled={syncing}
            aria-label="Mit Mealie synchronisieren"
            className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-ink-soft hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            <span>Mealie</span>
          </button>
          <Link
            href="/recipes/new"
            aria-label="Eigenes Rezept anlegen"
            className="flex items-center gap-1.5 px-3 h-10 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-ink-soft hover:text-white transition-all"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Neu</span>
          </Link>
        </div>
      </div>

      {/* Import per Link */}
      <form onSubmit={submitImport} className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-3 space-y-2">
        <label htmlFor="import-url" className="flex items-center gap-1.5 text-sm font-medium text-white">
          <Link2 size={15} className="text-primary" /> Rezept per Link hinzufügen
        </label>
        <div className="flex gap-2">
          <input
            id="import-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="https://… Link einfügen"
            value={importUrl}
            onChange={e => { setImportUrl(e.target.value); if (importError) setImportError('') }}
            disabled={importing}
            className="flex-1 min-w-0 h-11 text-base"
          />
          <button
            type="submit"
            disabled={importing || !importUrl.trim()}
            className="flex items-center justify-center gap-1.5 px-4 h-11 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-all disabled:opacity-40 flex-shrink-0"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : null}
            {importing ? 'Lädt…' : 'Hinzufügen'}
          </button>
        </div>
        {importing && (
          <p className="text-xs text-ink-muted">Rezept wird in Mealie angelegt, das dauert ein paar Sekunden…</p>
        )}
        {importError && (
          <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {importError}
          </p>
        )}
      </form>

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
                  ✓ Fertig: {syncProgress.created} neu, {syncProgress.synced} aktualisiert
                  {(syncProgress.removed ?? 0) > 0 && `, ${syncProgress.removed} entfernt`}
                  {(syncProgress.errors ?? 0) > 0 && `, ${syncProgress.errors} fehlgeschlagen`}
                  {syncProgress.removalSkipped && <span className="block text-amber-300">{syncProgress.removalSkipped}</span>}
                </span>
              ) : (
                <>
                  <RefreshCw size={13} className="animate-spin text-primary flex-shrink-0" />
                  <span className="text-ink-muted truncate">
                    {syncProgress.status === 'listing'
                      ? (syncProgress.message ?? 'Lade Liste…')
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
          {syncProgress.status === 'done' && (syncProgress.failed?.length ?? 0) > 0 && (
            <div className="border-t border-green-500/20 px-4 py-3 space-y-1">
              {syncProgress.failed!.slice(0, 5).map(f => (
                <p key={f.slug} className="text-xs text-ink-soft">
                  <span className="font-mono text-red-300">{f.slug}</span>
                  <span className="text-ink-hint"> – {f.error}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & effort filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hint" />
          <input
            type="search"
            placeholder="Rezept oder Tag suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-11 text-base"
          />
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Nach Aufwand filtern">
          {EFFORT_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setEffortFilter(key)}
              aria-pressed={effortFilter === key}
              className={`flex items-center gap-1 px-3.5 h-9 rounded-full text-sm font-medium border transition-all ${
                effortFilter === key
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-[#141414] text-ink-muted border-[#2a2a2a]'
              }`}
            >
              {key === 'quick' && <Zap size={13} />}
              {key === 'involved' && <ChefHat size={13} />}
              {label} <span className="opacity-60 tabular-nums">{counts[key]}</span>
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
        <div className="text-center py-12">
          <BookOpen size={40} className="mx-auto text-[#333] mb-3" />
          {recipes.length === 0 ? (
            <>
              <p className="text-ink-muted">Noch keine Rezepte</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  onClick={sync}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 h-11 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                  Aus Mealie holen
                </button>
                <Link href="/recipes/new" className="text-sm text-ink-muted hover:text-white transition-colors py-2">
                  oder eigenes Rezept anlegen
                </Link>
              </div>
            </>
          ) : effortFilter !== 'all' && searched.length > 0 ? (
            <>
              <p className="text-ink-muted">
                Noch keine Rezepte als „{effortFilter === 'quick' ? 'Schnell' : 'Aufwändig'}“ markiert
              </p>
              <p className="text-sm text-ink-hint mt-1 px-6">Im Rezept kannst du den Aufwand mit einem Tipp festlegen.</p>
            </>
          ) : (
            <>
              <p className="text-ink-muted">Keine Treffer</p>
              <p className="text-sm text-ink-hint mt-1">Versuch es mit einem anderen Suchbegriff</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(recipe => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="group bg-[#141414] border border-[#1e1e1e] hover:border-[#2d2d2d] rounded-xl overflow-hidden transition-all active:scale-[0.98]"
            >
              {/* Image */}
              <div className="relative h-28 overflow-hidden">
                {recipe.image_url ? (
                  <>
                    <Image
                      src={recipe.image_url}
                      alt=""
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      unoptimized onError={hideBrokenImage}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl"
                    style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(30,18,8,1) 70%)' }}>
                    🍽️
                  </div>
                )}
                {recipe.effort && (
                  <div className="absolute top-1.5 left-1.5">
                    <EffortBadge effort={recipe.effort} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2 mb-1.5">{recipe.name}</h3>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-hint">
                  {recipe.rating === 1 ? (
                    <span className="text-red-300/80">Nicht nochmal</span>
                  ) : recipe.rating ? (
                    <StarRating rating={recipe.rating} size={12} />
                  ) : null}
                  {(recipe.prep_time + recipe.cook_time) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={10} />
                      {recipe.prep_time + recipe.cook_time} Min.
                    </span>
                  )}
                  {recipe.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="bg-[#1e1e1e] px-1.5 py-0.5 rounded-full truncate max-w-[7rem]">{tag}</span>
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
