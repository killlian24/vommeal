'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Clock, Users, ExternalLink, Edit2, Trash2, Save, X, Plus } from 'lucide-react'
import { StarRating } from '@/components/StarRating'

type Ingredient = { amount: string; unit: string; name: string; note?: string }
type Instruction = { text: string }
type Recipe = {
  id: string; name: string; description: string; tags: string[]
  servings: number; prep_time: number; cook_time: number
  ingredients: Ingredient[]; instructions: Instruction[]
  image_url: string; source: 'local' | 'mealie'
  mealie_id: string | null; mealie_slug: string | null
  rating: number | null
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const isNew = id === 'new'
  const [mealieError, setMealieError] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<Recipe>({
    id: '', name: '', description: '', tags: [], servings: 4,
    prep_time: 0, cook_time: 0, ingredients: [], instructions: [],
    image_url: '', source: 'local', mealie_id: null, mealie_slug: null, rating: null,
  })
  const [loading, setLoading] = useState(!isNew)
  const [editing, setEditing] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [settings, setSettings] = useState<{ mealie_url: string }>({ mealie_url: '' })

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings)
    if (!isNew) {
      fetch(`/api/recipes/${id}`).then(async r => {
        if (!r.ok) { router.replace('/recipes'); return }
        setRecipe(await r.json())
        setLoading(false)
      })
    }
  }, [id, isNew])

  const save = async () => {
    if (!recipe.name.trim()) return
    setSaving(true)
    const method = isNew ? 'POST' : 'PUT'
    const url = isNew ? '/api/recipes' : `/api/recipes/${id}`
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe),
    })
    const saved = await res.json()
    setSaving(false)
    if (isNew) router.replace(`/recipes/${saved.id}`)
    else { setRecipe(saved); setEditing(false) }
  }

  const del = async () => {
    if (!confirm('Delete this recipe?')) return
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    router.push('/recipes')
  }

  const updateIngredient = (i: number, field: keyof Ingredient, value: string) =>
    setRecipe(r => ({ ...r, ingredients: r.ingredients.map((ing, idx) => idx === i ? { ...ing, [field]: value } : ing) }))

  const removeIngredient = (i: number) =>
    setRecipe(r => ({ ...r, ingredients: r.ingredients.filter((_, idx) => idx !== i) }))

  const addIngredient = () =>
    setRecipe(r => ({ ...r, ingredients: [...r.ingredients, { amount: '', unit: '', name: '' }] }))

  const updateInstruction = (i: number, text: string) =>
    setRecipe(r => ({ ...r, instructions: r.instructions.map((ins, idx) => idx === i ? { text } : ins) }))

  const removeInstruction = (i: number) =>
    setRecipe(r => ({ ...r, instructions: r.instructions.filter((_, idx) => idx !== i) }))

  const addInstruction = () =>
    setRecipe(r => ({ ...r, instructions: [...r.instructions, { text: '' }] }))

  const addTag = () => {
    if (!tagInput.trim()) return
    setRecipe(r => ({ ...r, tags: [...new Set([...r.tags, tagInput.trim()])] }))
    setTagInput('')
  }

  const mealieUrl = recipe.mealie_slug && settings.mealie_url
    ? `${settings.mealie_url}/g/home/r/${recipe.mealie_slug}`
    : null

  if (loading) return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-52 rounded-xl" />
      <div className="skeleton h-6 w-64" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <div className="flex items-center justify-between">
        <Link href="/recipes" className="flex items-center gap-1.5 text-sm text-[#666] hover:text-white transition-colors">
          <ArrowLeft size={15} />
          Recipes
        </Link>
        <div className="flex items-center gap-2">
          {!isNew && mealieUrl && (
            <a href={mealieUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs transition-all border border-blue-500/20">
              <ExternalLink size={12} />
              Mealie
            </a>
          )}
          {!isNew && !editing && (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] text-[#888] hover:text-white text-xs transition-all border border-[#2a2a2a]">
                <Edit2 size={12} />
                Edit
              </button>
              {recipe.source === 'local' && (
                <button onClick={del} title="Delete recipe"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-all border border-red-500/20">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-all disabled:opacity-50">
                <Save size={12} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              {!isNew && (
                <button onClick={() => setEditing(false)}
                  className="p-1.5 rounded-lg hover:bg-[#1c1c1c] text-[#666] transition-all">
                  <X size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Image */}
      {recipe.image_url && (
        <div className="relative h-52 rounded-xl overflow-hidden bg-[#141414]">
          <Image src={recipe.image_url} alt={recipe.name} fill className="object-cover" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/80 to-transparent" />
        </div>
      )}

      {/* Name */}
      {editing ? (
        <input
          value={recipe.name}
          onChange={e => setRecipe(r => ({ ...r, name: e.target.value }))}
          placeholder="Recipe name"
          className="text-xl font-bold bg-[#141414] border-[#2a2a2a]"
          autoFocus={isNew}
        />
      ) : (
        <h1 className="text-2xl font-bold text-white">{recipe.name}</h1>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <label className="flex items-center gap-2 text-sm text-[#888]">
              <Clock size={14} /> Prep
              <input value={recipe.prep_time} onChange={e => setRecipe(r => ({ ...r, prep_time: parseInt(e.target.value) || 0 }))}
                type="number" className="w-16 text-center" placeholder="min" />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#888]">
              Cook
              <input value={recipe.cook_time} onChange={e => setRecipe(r => ({ ...r, cook_time: parseInt(e.target.value) || 0 }))}
                type="number" className="w-16 text-center" placeholder="min" />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#888]">
              <Users size={14} /> Serves
              <input value={recipe.servings} onChange={e => setRecipe(r => ({ ...r, servings: parseInt(e.target.value) || 0 }))}
                type="number" className="w-16 text-center" />
            </label>
          </>
        ) : (
          <>
            {(recipe.prep_time + recipe.cook_time) > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-[#666]">
                <Clock size={14} className="text-primary" />
                {recipe.prep_time + recipe.cook_time} min
              </span>
            )}
            {recipe.servings > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-[#666]">
                <Users size={14} className="text-primary" />
                {recipe.servings} servings
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              recipe.source === 'mealie'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                : 'bg-[#1a1a1a] text-[#666] border-[#2a2a2a]'
            }`}>
              {recipe.source === 'mealie' ? '📌 Mealie' : '📝 Local'}
            </span>
            <StarRating
              rating={recipe.rating}
              size={16}
              editable
              onChange={async (val) => {
                const newRating = val === 0 ? null : val
                setRecipe(r => ({ ...r, rating: newRating }))
                setMealieError(null)
                const res = await fetch(`/api/recipes/${recipe.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rating: newRating }),
                })
                const data = await res.json()
                if (data.mealie_error) setMealieError(data.mealie_error)
              }}
            />
          </>
        )}
      </div>

      {mealieError && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          Mealie sync failed: {mealieError}
        </p>
      )}

      {/* Tags */}
      <div>
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {tag}
              {editing && (
                <button onClick={() => setRecipe(r => ({ ...r, tags: r.tags.filter(t => t !== tag) }))} className="hover:text-red-400 transition-colors">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {editing && (
            <div className="flex gap-1">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag..." className="h-6 text-xs px-2 py-0 w-24" />
              <button onClick={addTag} className="h-6 px-2 rounded-md bg-[#222] hover:bg-[#2a2a2a] text-xs text-[#888] hover:text-white transition-all">+</button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {(editing || recipe.description) && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#555] mb-2">Description</h2>
          {editing ? (
            <textarea
              value={recipe.description}
              onChange={e => setRecipe(r => ({ ...r, description: e.target.value }))}
              placeholder="Short description..."
              rows={2}
              className="resize-none"
            />
          ) : (
            <p className="text-sm text-[#888] leading-relaxed">{recipe.description}</p>
          )}
        </div>
      )}

      {/* Image URL (editing) */}
      {editing && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#555] mb-2">Image URL</h2>
          <input
            value={recipe.image_url}
            onChange={e => setRecipe(r => ({ ...r, image_url: e.target.value }))}
            placeholder="https://..."
          />
        </div>
      )}

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#555]">Ingredients</h2>
          {editing && (
            <button onClick={addIngredient} className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors">
              <Plus size={12} /> Add
            </button>
          )}
        </div>
        {recipe.ingredients.length === 0 && !editing && (
          <p className="text-sm text-[#444]">No ingredients listed</p>
        )}
        <div className="space-y-2">
          {recipe.ingredients.map((ing, i) => (
            editing ? (
              <div key={i} className="flex gap-2 items-center">
                <input value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)}
                  placeholder="Qty" className="w-16" />
                <input value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)}
                  placeholder="Unit" className="w-20" />
                <input value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)}
                  placeholder="Ingredient" className="flex-1" />
                <button onClick={() => removeIngredient(i)} className="text-[#444] hover:text-red-400 transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                <span className="text-primary font-medium min-w-[3rem] text-right">
                  {[ing.amount, ing.unit].filter(Boolean).join(' ') || '—'}
                </span>
                <span className="text-white">{ing.name}</span>
                {ing.note && <span className="text-[#555] text-xs">({ing.note})</span>}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#555]">Instructions</h2>
          {editing && (
            <button onClick={addInstruction} className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors">
              <Plus size={12} /> Add step
            </button>
          )}
        </div>
        {recipe.instructions.length === 0 && !editing && (
          <p className="text-sm text-[#444]">No instructions listed</p>
        )}
        <div className="space-y-3">
          {recipe.instructions.map((ins, i) => (
            editing ? (
              <div key={i} className="flex gap-2">
                <span className="text-primary font-bold text-sm mt-2 min-w-[1.5rem]">{i + 1}.</span>
                <textarea
                  value={ins.text}
                  onChange={e => updateInstruction(i, e.target.value)}
                  placeholder={`Step ${i + 1}`}
                  rows={2}
                  className="flex-1 resize-none"
                />
                <button onClick={() => removeInstruction(i)} className="text-[#444] hover:text-red-400 transition-colors mt-2 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span className="text-primary font-bold text-sm min-w-[1.5rem] mt-0.5">{i + 1}.</span>
                <p className="text-sm text-[#ccc] leading-relaxed">{ins.text}</p>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Mealie link (editing, local recipes) */}
      {editing && recipe.source === 'local' && (
        <div className="border-t border-[#1e1e1e] pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#555] mb-2">Link to Mealie (optional)</h2>
          <input
            value={recipe.mealie_slug || ''}
            onChange={e => setRecipe(r => ({ ...r, mealie_slug: e.target.value || null }))}
            placeholder="recipe-slug"
          />
          <p className="text-xs text-[#444] mt-1">Enter the Mealie recipe slug to open it in Mealie</p>
        </div>
      )}
    </div>
  )
}
