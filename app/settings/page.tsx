'use client'

import { useState, useEffect } from 'react'
import { Save, RefreshCw, Check, X, Info, ChevronDown, ChevronUp } from 'lucide-react'

type Settings = {
  mealie_url: string; mealie_token: string; has_token: boolean
  user1_name: string; user2_name: string
  ha_url: string; ha_token: string; has_ha_token: boolean; ha_entity: string
  dinner_category: string; category_order: string
  env?: {
    mealie_url: boolean; mealie_token: boolean
    ha_url: boolean; ha_token: boolean; ha_entity: boolean
  }
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
  const [open, setOpen] = useState<Set<string>>(new Set(['profiles']))

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

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
        <p className="text-sm text-[#666] mt-0.5">Profiles, connections & preferences</p>
      </div>

      {/* Profiles */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <button onClick={() => toggle('profiles')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#191919] transition-colors text-left">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">👥</span>
              <h2 className="font-semibold text-white">Profiles</h2>
              {(settings.user1_name || settings.user2_name) && (
                <span className="text-xs text-[#555]">
                  {[settings.user1_name, settings.user2_name].filter(Boolean).join(' & ')}
                </span>
              )}
            </div>
          </div>
          <ChevronDown size={15} className={`text-[#555] transition-transform flex-shrink-0 ${open.has('profiles') ? 'rotate-180' : ''}`} />
        </button>
        {open.has('profiles') && (
          <div className="px-5 py-4 space-y-3 border-t border-[#1e1e1e]">
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
        )}
      </div>

      {/* Mealie connection */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <button onClick={() => toggle('mealie')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#191919] transition-colors text-left">
          <div className="flex items-center gap-2">
            <span className="text-base">📌</span>
            <h2 className="font-semibold text-white">Mealie</h2>
            {settings.mealie_url && (
              <span className="text-xs text-[#555] truncate max-w-[140px]">{settings.mealie_url.replace('https://', '')}</span>
            )}
            {settings.has_token && <span className="text-xs text-green-500">✓ token set</span>}
          </div>
          <ChevronDown size={15} className={`text-[#555] transition-transform flex-shrink-0 ${open.has('mealie') ? 'rotate-180' : ''}`} />
        </button>
        {open.has('mealie') && (
        <div className="px-5 py-4 space-y-4 border-t border-[#1e1e1e]">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Mealie URL</label>
            <input
              value={settings.mealie_url}
              onChange={e => setSettings(s => ({ ...s, mealie_url: e.target.value }))}
              placeholder="https://mealie.your-domain.com"
              disabled={settings.env?.mealie_url}
            />
            <p className="text-xs text-[#444] mt-1">
              {settings.env?.mealie_url ? 'Controlled by MEALIE_URL in Docker.' : 'Your Mealie instance URL (no trailing slash)'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">API Token</label>
            <input
              value={settings.mealie_token}
              onChange={e => setSettings(s => ({ ...s, mealie_token: e.target.value }))}
              type="password"
              placeholder={settings.has_token ? '••••••••' : 'Your Mealie API token'}
              disabled={settings.env?.mealie_token}
            />
            <div className="flex items-start gap-1.5 mt-1.5 text-[#444] text-xs">
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              <span>{settings.env?.mealie_token ? 'Controlled by MEALIE_TOKEN in Docker.' : 'Get your token in Mealie → Profile → API Tokens'}</span>
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
        )}
      </div>

      {/* Shopping category order */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <button onClick={() => toggle('shopping')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#191919] transition-colors text-left">
          <div className="flex items-center gap-2">
            <span className="text-base">🛒</span>
            <h2 className="font-semibold text-white">Shopping list order</h2>
          </div>
          <ChevronDown size={15} className={`text-[#555] transition-transform flex-shrink-0 ${open.has('shopping') ? 'rotate-180' : ''}`} />
        </button>
        {open.has('shopping') && (
          <div className="px-5 py-4 space-y-2 border-t border-[#1e1e1e]">
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
        )}
      </div>

      {/* Home Assistant */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <button onClick={() => toggle('ha')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#191919] transition-colors text-left">
          <div className="flex items-center gap-2">
            <span className="text-base">🏠</span>
            <h2 className="font-semibold text-white">Home Assistant</h2>
            {settings.ha_url && <span className="text-xs text-[#555] truncate max-w-[120px]">{settings.ha_url.replace('http://', '')}</span>}
            {settings.has_ha_token && <span className="text-xs text-green-500">✓ token set</span>}
          </div>
          <ChevronDown size={15} className={`text-[#555] transition-transform flex-shrink-0 ${open.has('ha') ? 'rotate-180' : ''}`} />
        </button>
        {open.has('ha') && (
          <div className="px-5 py-4 space-y-4 border-t border-[#1e1e1e]">
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5">HA URL</label>
              <input
                value={settings.ha_url}
                onChange={e => setSettings(s => ({ ...s, ha_url: e.target.value }))}
                placeholder="http://192.168.0.16:8123"
                disabled={settings.env?.ha_url}
              />
              {settings.env?.ha_url && <p className="text-xs text-[#444] mt-1">Controlled by HA_URL in Docker.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5">Long-Lived Access Token</label>
              <input
                value={settings.ha_token}
                onChange={e => setSettings(s => ({ ...s, ha_token: e.target.value }))}
                type="password"
                placeholder={settings.has_ha_token ? '••••••••' : 'eyJhbGci...'}
                disabled={settings.env?.ha_token}
              />
              <p className="text-xs text-[#444] mt-1">
                {settings.env?.ha_token ? 'Controlled by HA_TOKEN in Docker.' : 'HA → Profile → Security → Long-Lived Access Tokens'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5">Todo entity ID</label>
              <input
                value={settings.ha_entity}
                onChange={e => setSettings(s => ({ ...s, ha_entity: e.target.value }))}
                placeholder="todo.google_keep_einkaufsliste"
                disabled={settings.env?.ha_entity}
              />
              <p className="text-xs text-[#444] mt-1">
                {settings.env?.ha_entity ? 'Controlled by HA_ENTITY in Docker.' : 'HA → Developer Tools → States → search todo.'}
              </p>
            </div>
            <button
              onClick={saveHa}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              {haSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
            </button>
          </div>
        )}
      </div>

      {/* About + Docker */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <button onClick={() => toggle('about')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#191919] transition-colors text-left">
          <div className="flex items-center gap-2">
            <span className="text-base">ℹ️</span>
            <h2 className="font-semibold text-white">About & Docker</h2>
          </div>
          <ChevronDown size={15} className={`text-[#555] transition-transform flex-shrink-0 ${open.has('about') ? 'rotate-180' : ''}`} />
        </button>
        {open.has('about') && (
          <div className="border-t border-[#1e1e1e] px-5 py-4 space-y-4">
            <div className="space-y-2 text-sm text-[#666]">
              <p>A meal planner made for two. Plan your week, sync recipes from Mealie, and generate shopping lists automatically.</p>
              <div className="border-t border-[#1e1e1e] pt-3 space-y-1 text-xs text-[#444]">
                <p>• Recipes are stored locally in SQLite</p>
                <p>• Mealie recipes are mirrored — edit in Mealie, re-sync here</p>
                <p>• Shopping list auto-categorizes ingredients</p>
                <p>• Use "Copy" on the shopping list to share with anyone</p>
              </div>
            </div>
            <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-[#555] mb-2">Docker environment variables</p>
              <div className="font-mono text-xs text-[#555] space-y-1">
                <p><span className="text-[#444]"># Optional: pre-configure Mealie</span></p>
                <p>MEALIE_URL=https://mealie.example.com</p>
                <p>MEALIE_TOKEN=your-token-here</p>
                <p><span className="text-[#444]"># Optional: pre-configure Home Assistant</span></p>
                <p>HA_URL=http://homeassistant.local:8123</p>
                <p>HA_TOKEN=your-token-here</p>
                <p>HA_ENTITY=todo.shopping_list</p>
                <p><span className="text-[#444]"># Data persistence</span></p>
                <p>DATA_DIR=/app/data</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
