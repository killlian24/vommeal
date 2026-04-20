'use client'

import { useState, useEffect } from 'react'
import { Save, RefreshCw, Check, X, Info, ChevronDown, ChevronUp } from 'lucide-react'

type Settings = {
  mealie_url: string; mealie_token: string; has_token: boolean
  user1_name: string; user2_name: string
  ha_url: string; ha_token: string; has_ha_token: boolean; ha_entity: string
  dinner_category: string; category_order: string
}
type MealieCategory = { id: string; name: string; slug: string }

const DEFAULT_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥦 Produce',
  meat: '🥩 Meat & Fish',
  dairy: '🧀 Dairy & Eggs',
  bakery: '🍞 Bakery & Pasta',
  pantry: '🫙 Pantry',
  frozen: '🧊 Frozen',
  beverages: '🥤 Beverages',
  other: '📦 Other',
}
type TestResult = { ok: boolean; user?: string; error?: string } | null

function getInitials(name: string) {
  return name.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    mealie_url: '', mealie_token: '', has_token: false,
    user1_name: '', user2_name: '',
    ha_url: '', ha_token: '', has_ha_token: false, ha_entity: '',
    dinner_category: '', category_order: '',
  })
  const [categoryOrder, setCategoryOrder] = useState<string[]>(DEFAULT_CATEGORY_ORDER)
  const [catOrderSaved, setCatOrderSaved] = useState(false)
  const [categories, setCategories] = useState<MealieCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [haSaved, setHaSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      setSettings(s)
      if (s.category_order) {
        try { setCategoryOrder(JSON.parse(s.category_order)) } catch { /* use default */ }
      }
    })
  }, [])

  const moveCat = (index: number, dir: -1 | 1) => {
    const next = [...categoryOrder]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setCategoryOrder(next)
  }

  const saveCategoryOrder = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_order: JSON.stringify(categoryOrder) }),
    })
    setCatOrderSaved(true)
    setTimeout(() => setCatOrderSaved(false), 2000)
  }

  const loadCategories = async () => {
    setLoadingCats(true)
    try {
      const res = await fetch('/api/mealie/categories')
      if (res.ok) setCategories(await res.json())
    } finally {
      setLoadingCats(false)
    }
  }

  const save = async () => {
    setSaving(true); setSaved(false)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    fetch('/api/settings').then(r => r.json()).then(setSettings)
  }

  const saveHa = async () => {
    setSaving(true); setHaSaved(false)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ha_url: settings.ha_url, ha_token: settings.ha_token, ha_entity: settings.ha_entity }),
    })
    setSaving(false); setHaSaved(true)
    setTimeout(() => setHaSaved(false), 2000)
    fetch('/api/settings').then(r => r.json()).then(setSettings)
  }

  const test = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setTesting(true); setTestResult(null)
    const res = await fetch('/api/mealie/test')
    const data = await res.json()
    setTestResult(data)
    setTesting(false)
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-[#666] mt-0.5">Configure your Mealie connection</p>
      </div>

      {/* Profiles */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-base">👥</span>
            <h2 className="font-semibold text-white">Profiles</h2>
          </div>
          <p className="text-xs text-[#555] mt-1">Set your names so you can vote on each other's dinner suggestions</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {[
            { key: 'user1_name' as const, label: 'Person 1' },
            { key: 'user2_name' as const, label: 'Person 2' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              {settings[key] ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: key === 'user1_name' ? '#f97316' : '#3b82f6' }}>
                  {getInitials(settings[key])}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex-shrink-0" />
              )}
              <input
                value={settings[key]}
                onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                placeholder={label}
              />
            </div>
          ))}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50 mt-1">
            {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save profiles</>}
          </button>
        </div>
      </div>

      {/* Mealie connection */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-base">📌</span>
            <h2 className="font-semibold text-white">Mealie</h2>
          </div>
          <p className="text-xs text-[#555] mt-1">Connect to your self-hosted Mealie instance to sync recipes</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Mealie URL</label>
            <input
              value={settings.mealie_url}
              onChange={e => setSettings(s => ({ ...s, mealie_url: e.target.value }))}
              placeholder="https://mealie.your-domain.com"
            />
            <p className="text-xs text-[#444] mt-1">Your Mealie instance URL (no trailing slash)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">API Token</label>
            <input
              value={settings.mealie_token}
              onChange={e => setSettings(s => ({ ...s, mealie_token: e.target.value }))}
              type="password"
              placeholder={settings.has_token ? '••••••••' : 'Your Mealie API token'}
            />
            <div className="flex items-start gap-1.5 mt-1.5 text-[#444] text-xs">
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              <span>Get your token in Mealie → Profile → API Tokens</span>
            </div>
          </div>

          {/* Dinner category filter */}
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Dinner category</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select
                  value={settings.dinner_category}
                  onChange={e => setSettings(s => ({ ...s, dinner_category: e.target.value }))}
                  className="w-full appearance-none pr-8 text-sm"
                  style={{ background: '#0f0f0f' }}
                >
                  <option value="">All recipes (no filter)</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
              </div>
              <button
                onClick={loadCategories}
                disabled={loadingCats || !settings.mealie_url}
                title="Load categories from Mealie"
                className="px-3 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-[#666] hover:text-white transition-all disabled:opacity-40"
              >
                <RefreshCw size={13} className={loadingCats ? 'animate-spin' : ''} />
              </button>
            </div>
            <p className="text-xs text-[#444] mt-1">Only sync recipes from this Mealie category (e.g. "Abendessen"). Hit the refresh icon to load your categories.</p>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border ${
              testResult.ok
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {testResult.ok
                ? <><Check size={14} /> Connected as {testResult.user}</>
                : <><X size={14} /> {testResult.error}</>
              }
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={test}
              disabled={testing || !settings.mealie_url}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] text-sm text-[#888] hover:text-white transition-all disabled:opacity-40"
            >
              <RefreshCw size={13} className={testing ? 'animate-spin' : ''} />
              Test connection
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              {saved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
            </button>
          </div>
        </div>
      </div>

      {/* Shopping category order */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-base">🛒</span>
            <h2 className="font-semibold text-white">Shopping list order</h2>
          </div>
          <p className="text-xs text-[#555] mt-1">Drag categories into your supermarket's aisle order — items sync to Google Keep in this sequence</p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {categoryOrder.map((cat, i) => (
            <div key={cat} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0f0f0f] border border-[#1e1e1e]">
              <span className="text-xs text-[#444] w-4 text-center">{i + 1}</span>
              <span className="flex-1 text-sm text-white">{CATEGORY_LABELS[cat] || cat}</span>
              <div className="flex gap-1">
                <button onClick={() => moveCat(i, -1)} disabled={i === 0}
                  className="p-1 rounded hover:bg-[#222] text-[#555] hover:text-white disabled:opacity-20 transition-all">
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => moveCat(i, 1)} disabled={i === categoryOrder.length - 1}
                  className="p-1 rounded hover:bg-[#222] text-[#555] hover:text-white disabled:opacity-20 transition-all">
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>
          ))}
          <button onClick={saveCategoryOrder}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all mt-2">
            {catOrderSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save order</>}
          </button>
        </div>
      </div>

      {/* Home Assistant */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-base">🏠</span>
            <h2 className="font-semibold text-white">Home Assistant</h2>
          </div>
          <p className="text-xs text-[#555] mt-1">Sync your Google Keep shopping list via Home Assistant</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">HA URL</label>
            <input
              value={settings.ha_url}
              onChange={e => setSettings(s => ({ ...s, ha_url: e.target.value }))}
              placeholder="http://192.168.0.16:8123"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Long-Lived Access Token</label>
            <input
              value={settings.ha_token}
              onChange={e => setSettings(s => ({ ...s, ha_token: e.target.value }))}
              type="password"
              placeholder={settings.has_ha_token ? '••••••••' : 'eyJhbGci...'}
            />
            <p className="text-xs text-[#444] mt-1">HA → Profile → Security → Long-Lived Access Tokens</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Todo entity ID</label>
            <input
              value={settings.ha_entity}
              onChange={e => setSettings(s => ({ ...s, ha_entity: e.target.value }))}
              placeholder="todo.google_keep_einkaufsliste"
            />
            <p className="text-xs text-[#444] mt-1">HA → Developer Tools → States → search todo.</p>
          </div>
          <button
            onClick={saveHa}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {haSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl px-5 py-4 space-y-3">
        <h2 className="font-semibold text-white">About Vommeal</h2>
        <div className="space-y-2 text-sm text-[#666]">
          <p>A meal planner made for two. Plan your week, sync recipes from Mealie, and generate shopping lists automatically.</p>
          <div className="border-t border-[#1e1e1e] pt-3 space-y-1 text-xs text-[#444]">
            <p>• Recipes are stored locally in SQLite</p>
            <p>• Mealie recipes are mirrored — edit in Mealie, re-sync here</p>
            <p>• Shopping list auto-categorizes ingredients</p>
            <p>• Use "Copy" on the shopping list to share with anyone</p>
          </div>
        </div>
      </div>

      {/* Docker env info */}
      <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-5 py-4">
        <h2 className="font-semibold text-white mb-2 text-sm">Docker environment variables</h2>
        <div className="font-mono text-xs text-[#555] space-y-1">
          <p><span className="text-[#444]"># Optional: pre-configure Mealie</span></p>
          <p>MEALIE_URL=https://mealie.example.com</p>
          <p>MEALIE_TOKEN=your-token-here</p>
          <p><span className="text-[#444]"># Data persistence</span></p>
          <p>DATA_DIR=/app/data</p>
        </div>
      </div>
    </div>
  )
}
