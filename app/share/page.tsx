'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Link2, Loader2, AlertCircle } from 'lucide-react'
import { importRecipe, extractFirstUrl } from '@/lib/recipeImport'
import { track } from '@/lib/track'

// Android share target (see public/manifest.json): the shared link arrives as
// ?url=…, or buried in ?text=… (most apps) or ?title=….
function ShareImport() {
  const params = useSearchParams()
  const router = useRouter()
  const url = extractFirstUrl(params.get('url'), params.get('text'), params.get('title'))
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    if (!url) return
    setImporting(true)
    setError('')
    const result = await importRecipe(url)
    track('recipe_import', { source: 'share', ok: 'id' in result })
    if ('id' in result) {
      router.replace(`/recipes/${result.id}`)
      return
    }
    setImporting(false)
    setError(result.error)
  }

  if (!url) {
    return (
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 text-center space-y-3">
        <AlertCircle size={32} className="mx-auto text-amber-400" />
        <h1 className="text-xl font-bold text-white">Kein Link gefunden</h1>
        <p className="text-sm text-ink-muted">
          Im geteilten Inhalt steckt kein Link zu einem Rezept. Teile direkt die Rezeptseite
          oder füge den Link auf der Rezepte-Seite ein.
        </p>
        <Link href="/recipes" className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-sm font-medium text-white">
          Zu den Rezepten
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5 space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Link2 size={18} />
        <span className="text-xs font-semibold uppercase tracking-widest">Geteilter Link</span>
      </div>
      <h1 className="text-2xl font-bold text-white">Rezept importieren?</h1>
      <p className="text-sm text-ink-soft break-all bg-[#0f0f0f] border border-[#222] rounded-xl px-3 py-2.5">{url}</p>
      <p className="text-sm text-ink-muted">Das Rezept wird in Mealie angelegt und erscheint danach bei euren Rezepten.</p>

      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={confirm}
          disabled={importing}
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold transition-all disabled:opacity-60 active:scale-[0.98]"
        >
          {importing && <Loader2 size={18} className="animate-spin" />}
          {importing ? 'Wird importiert…' : error ? 'Nochmal versuchen' : 'Importieren'}
        </button>
        <Link
          href="/recipes"
          className="flex items-center justify-center h-11 rounded-xl text-sm font-medium text-ink-muted"
        >
          Abbrechen
        </Link>
      </div>
    </div>
  )
}

export default function SharePage() {
  return (
    <div className="max-w-md mx-auto pt-4">
      <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
        <ShareImport />
      </Suspense>
    </div>
  )
}
