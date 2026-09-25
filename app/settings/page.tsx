'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Info, ChevronDown, ChevronUp, Download, X } from 'lucide-react'
import {
  BUILT_IN_CATEGORY_KEYWORDS,
  CATEGORY_IDS,
  sanitizeCustomCategoryKeywords,
} from '@/lib/categoryRules'
import type { CategoryId, CategoryKeywordMap } from '@/lib/categoryRules'
import { Avatar } from '@/components/Avatar'
import {
  Section, MetaText, Label, Hint, Toggle, PrimaryButton, StatusBox, responseError, secondaryButtonClass,
} from '@/components/settings/ui'
import { NotificationsSection, parseServiceList } from '@/components/settings/NotificationsSection'
import type { NotifySettings, NotifyTextDefaults } from '@/components/settings/NotificationsSection'
import { UsageSection } from '@/components/settings/UsageSection'

type Settings = {
  mealie_url: string; mealie_token: string; has_token: boolean
  user1_name: string; user2_name: string
  ha_url: string; ha_token: string; has_ha_token: boolean; ha_entity: string
  dinner_category: string; category_order: string; custom_category_keywords: string
  mealie_nightly_sync?: string
  timezone?: string
  notify_text_defaults?: NotifyTextDefaults
  env?: {
    mealie_url: boolean; mealie_token: boolean
    ha_url: boolean; ha_token: boolean; ha_entity: boolean
  }
} & Partial<NotifySettings>
type MealieCategory = { id: string; name: string; slug: string }

const DEFAULT_CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other']
const CATEGORY_LABELS: Record<string, string> = {
  produce: '🥦 Obst & Gemüse',
  meat: '🥩 Fleisch & Fisch',
  dairy: '🧀 Milchprodukte & Eier',
  bakery: '🍞 Brot & Nudeln',
  pantry: '🫙 Trockenware & Konserven',
  frozen: '🧊 Tiefkühl',
  beverages: '🥤 Getränke',
  other: '📦 Sonstiges',
}
type TestResult = { ok: boolean; user?: string; error?: string } | null
type SectionKey = 'profiles' | 'mealie' | 'shopping' | 'keywords' | 'ha'

const NOTIFY_DEFAULTS: NotifySettings = {
  notify_services: '[]',
  notify_weekly_enabled: '1',
  notify_weekly_day: '0',
  notify_weekly_time: '18:00',
  notify_daily_enabled: '0',
  notify_daily_time: '16:00',
  app_public_url: '',
  notify_people: '{}',
  notify_text_daily_planned: '',
  notify_text_daily_empty: '',
  notify_text_weekly: '',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    mealie_url: '', mealie_token: '', has_token: false,
    user1_name: '', user2_name: '',
    ha_url: '', ha_token: '', has_ha_token: false, ha_entity: '',
    dinner_category: '', category_order: '', custom_category_keywords: '{}',
  })
  const [loaded, setLoaded] = useState(false)
  // Ordered profile list, identical to what the plan page derives from /api/settings
  const profileNames = [settings.user1_name, settings.user2_name].filter(Boolean)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(DEFAULT_CATEGORY_ORDER)
  const [customKeywords, setCustomKeywords] = useState<CategoryKeywordMap>({})
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({})
  const [keywordsSaved, setKeywordsSaved] = useState(false)
  const [catOrderSaved, setCatOrderSaved] = useState(false)
  const [categories, setCategories] = useState<MealieCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(false)
  const [haSaved, setHaSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult>(null)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SectionKey, string>>>({})
  const [open, setOpen] = useState<Set<string>>(new Set(['profiles']))
  const [adminToken, setAdminToken] = useState('')

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const setError = (key: SectionKey, message: string) => setErrors(prev => ({ ...prev, [key]: message }))

  const reloadSettings = () => fetch('/api/settings').then(r => r.json()).then((s: Settings) => setSettings(s)).catch(() => {})

  useEffect(() => {
    setAdminToken(localStorage.getItem('vommeal_admin_token') || '')
    fetch('/api/settings').then(r => r.json()).then(s => {
      setSettings(s)
      setLoaded(true)
      if (s.category_order) {
        try { setCategoryOrder(JSON.parse(s.category_order)) } catch { /* use default */ }
      }
      if (s.custom_category_keywords) {
        try { setCustomKeywords(sanitizeCustomCategoryKeywords(JSON.parse(s.custom_category_keywords))) } catch { /* use empty */ }
      }
    }).catch(() => setLoaded(true))
  }, [])

  const authedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const withToken = (token: string): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { 'x-vommeal-admin-token': token } : {}),
      },
    })

    let res = await fetch(url, withToken(adminToken))
    if (res.status !== 401) return res

    const token = window.prompt('Admin-Passwort')
    if (!token) return res

    localStorage.setItem('vommeal_admin_token', token)
    setAdminToken(token)
    res = await fetch(url, withToken(token))
    return res
  }, [adminToken])

  // Sends the stored admin token if there is one, but never prompts. Used for
  // background loads so opening a section does not pop up a password dialog.
  const softFetch = useCallback((url: string) => {
    let token = ''
    try { token = localStorage.getItem('vommeal_admin_token') || '' } catch { /* storage unavailable */ }
    return fetch(url, { headers: token ? { 'x-vommeal-admin-token': token } : {} })
  }, [])

  const postSettings = (body: Record<string, string>) => authedFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const moveCat = (index: number, dir: -1 | 1) => {
    const next = [...categoryOrder]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setCategoryOrder(next)
  }

  const saveCategoryOrder = async () => {
    setError('shopping', '')
    const serialized = JSON.stringify(categoryOrder)
    const res = await postSettings({ category_order: serialized })
    if (!res.ok) { setError('shopping', await responseError(res)); return }
    setSettings(s => ({ ...s, category_order: serialized }))
    setCatOrderSaved(true)
    setTimeout(() => setCatOrderSaved(false), 2000)
  }

  const addCustomKeyword = (category: CategoryId) => {
    const draft = (keywordDrafts[category] ?? '').trim()
    if (!draft) return
    setCustomKeywords(prev => ({
      ...prev,
      [category]: Array.from(new Set([...(prev[category] ?? []), draft])),
    }))
    setKeywordDrafts(prev => ({ ...prev, [category]: '' }))
  }

  const removeCustomKeyword = (category: CategoryId, keyword: string) => {
    setCustomKeywords(prev => {
      const next = { ...prev }
      const values = (next[category] ?? []).filter(value => value !== keyword)
      if (values.length) next[category] = values
      else delete next[category]
      return next
    })
  }

  const saveCustomKeywords = async () => {
    setError('keywords', '')
    const serialized = JSON.stringify(customKeywords)
    const res = await postSettings({ custom_category_keywords: serialized })
    if (!res.ok) { setError('keywords', await responseError(res)); return }
    setSettings(s => ({ ...s, custom_category_keywords: serialized }))
    setKeywordsSaved(true)
    setTimeout(() => setKeywordsSaved(false), 2000)
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

  const nightlySync = settings.mealie_nightly_sync !== '0'

  const save = async (section: 'profiles' | 'mealie') => {
    setSaving(true); setSaved(false); setError(section, '')
    const res = await postSettings({
      mealie_url: settings.mealie_url,
      mealie_token: settings.mealie_token,
      user1_name: settings.user1_name,
      user2_name: settings.user2_name,
      dinner_category: settings.dinner_category,
      mealie_nightly_sync: nightlySync ? '1' : '0',
    })
    setSaving(false)
    if (!res.ok) { setError(section, await responseError(res)); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    reloadSettings()
  }

  const saveHa = async () => {
    setSaving(true); setHaSaved(false); setError('ha', '')
    const res = await postSettings({ ha_url: settings.ha_url, ha_token: settings.ha_token, ha_entity: settings.ha_entity })
    setSaving(false)
    if (!res.ok) { setError('ha', await responseError(res)); return }
    setHaSaved(true)
    setTimeout(() => setHaSaved(false), 2000)
    reloadSettings()
  }

  const test = async () => {
    setError('mealie', '')
    const saveRes = await postSettings({
      mealie_url: settings.mealie_url,
      mealie_token: settings.mealie_token,
      dinner_category: settings.dinner_category,
    })
    if (!saveRes.ok) { setError('mealie', await responseError(saveRes)); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/mealie/test')
      setTestResult(await res.json())
    } catch {
      setTestResult({ ok: false, error: 'Keine Verbindung zu Vommeal.' })
    } finally {
      setTesting(false)
    }
  }

  const downloadBackup = async () => {
    const res = await authedFetch('/api/backup')
    if (!res.ok) return

    const blob = await res.blob()
    const disposition = res.headers.get('content-disposition') || ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'vommeal-backup.db'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const haConfigured = !!settings.ha_url && settings.has_ha_token
  const notifyInitial: NotifySettings = {
    notify_services: settings.notify_services ?? NOTIFY_DEFAULTS.notify_services,
    notify_weekly_enabled: settings.notify_weekly_enabled ?? NOTIFY_DEFAULTS.notify_weekly_enabled,
    notify_weekly_day: settings.notify_weekly_day ?? NOTIFY_DEFAULTS.notify_weekly_day,
    notify_weekly_time: settings.notify_weekly_time ?? NOTIFY_DEFAULTS.notify_weekly_time,
    notify_daily_enabled: settings.notify_daily_enabled ?? NOTIFY_DEFAULTS.notify_daily_enabled,
    notify_daily_time: settings.notify_daily_time ?? NOTIFY_DEFAULTS.notify_daily_time,
    app_public_url: settings.app_public_url ?? NOTIFY_DEFAULTS.app_public_url,
    notify_people: settings.notify_people ?? NOTIFY_DEFAULTS.notify_people,
    notify_text_daily_planned: settings.notify_text_daily_planned ?? NOTIFY_DEFAULTS.notify_text_daily_planned,
    notify_text_daily_empty: settings.notify_text_daily_empty ?? NOTIFY_DEFAULTS.notify_text_daily_empty,
    notify_text_weekly: settings.notify_text_weekly ?? NOTIFY_DEFAULTS.notify_text_weekly,
  }
  const notifyDeviceCount = parseServiceList(settings.notify_services).length
  const envHint = (name: string) => `Wird in Docker über ${name} festgelegt.`

  return (
    <div className="space-y-4 max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
        <p className="text-sm text-[#a8a8a8] mt-0.5">Profile, Verbindungen und Vorlieben</p>
      </div>

      {/* Profile */}
      <Section
        id="profiles" icon="👥" title="Profile" open={open.has('profiles')} onToggle={toggle}
        meta={profileNames.length > 0 && <MetaText>{profileNames.join(' & ')}</MetaText>}
      >
        {/* Same ordered list the plan page uses, so colours match there */}
        <div className="space-y-3">
          {[
            { key: 'user1_name' as const, label: 'Person 1' },
            { key: 'user2_name' as const, label: 'Person 2' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              {settings[key] ? (
                <Avatar name={settings[key]} users={profileNames} size="lg" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#222] border border-[#3a3a3a] flex-shrink-0" />
              )}
              <input
                value={settings[key]}
                onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                placeholder={label}
                aria-label={label}
                className="h-11"
              />
            </div>
          ))}
        </div>
        {errors.profiles && <StatusBox ok={false}>{errors.profiles}</StatusBox>}
        <PrimaryButton onClick={() => save('profiles')} disabled={saving} done={saved} label="Profile speichern" />
      </Section>

      {/* Mealie */}
      <Section
        id="mealie" icon="📌" title="Mealie" open={open.has('mealie')} onToggle={toggle}
        meta={<>
          {settings.mealie_url && <MetaText className="max-w-[140px]">{settings.mealie_url.replace(/^https?:\/\//, '')}</MetaText>}
          {settings.has_token && <span className="text-xs text-green-400">✓ Token gesetzt</span>}
        </>}
      >
        <div>
          <Label htmlFor="mealie-url">Mealie-Adresse</Label>
          <input
            id="mealie-url"
            value={settings.mealie_url}
            onChange={e => setSettings(s => ({ ...s, mealie_url: e.target.value }))}
            placeholder="http://192.168.0.124:9925"
            disabled={settings.env?.mealie_url}
            className="h-11"
          />
          <Hint>
            {settings.env?.mealie_url ? envHint('MEALIE_URL') : 'Die Adresse im Heimnetz, die das NAS erreicht, z. B. http://192.168.0.124:9925 (einfaches http ist im Heimnetz in Ordnung).'}
          </Hint>
        </div>
        <div>
          <Label htmlFor="mealie-token">API-Token</Label>
          <input
            id="mealie-token"
            value={settings.mealie_token}
            onChange={e => setSettings(s => ({ ...s, mealie_token: e.target.value }))}
            type="password"
            placeholder={settings.has_token ? '••••••••' : 'Euer Mealie-API-Token'}
            disabled={settings.env?.mealie_token}
            className="h-11"
          />
          <div className="flex items-start gap-1.5 mt-1.5 text-[#8f8f8f] text-xs">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{settings.env?.mealie_token ? envHint('MEALIE_TOKEN') : 'Den Token gibt es in Mealie → Profil → API-Tokens.'}</span>
          </div>
        </div>

        {/* Dinner category filter */}
        <div>
          <Label htmlFor="dinner-category">Kategorie fürs Abendessen</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                id="dinner-category"
                value={settings.dinner_category}
                onChange={e => setSettings(s => ({ ...s, dinner_category: e.target.value }))}
                className="w-full h-11 appearance-none pr-8 text-sm"
                style={{ background: '#0f0f0f' }}
              >
                <option value="">Alle Rezepte (kein Filter)</option>
                {settings.dinner_category && !categories.some(c => c.name === settings.dinner_category) && (
                  <option value={settings.dinner_category}>{settings.dinner_category}</option>
                )}
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8f8f8f] pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={loadCategories}
              disabled={loadingCats || !settings.mealie_url}
              title="Kategorien aus Mealie laden"
              aria-label="Kategorien aus Mealie laden"
              className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#1c1c1c] hover:bg-[#252525] border border-[#333] text-[#c4c4c4] hover:text-white transition-all disabled:opacity-40"
            >
              <RefreshCw size={15} className={loadingCats ? 'animate-spin' : ''} />
            </button>
          </div>
          <Hint>Nur Rezepte aus dieser Mealie-Kategorie abgleichen (z. B. „Abendessen“). Tippt auf das Pfeil-Symbol, um eure Kategorien zu laden.</Hint>
        </div>

        <Toggle
          id="mealie-nightly-sync"
          label="Rezepte jede Nacht automatisch abgleichen"
          description="Holt neue und geänderte Rezepte aus Mealie, ohne dass ihr von Hand abgleichen müsst."
          checked={nightlySync}
          onChange={value => setSettings(s => ({ ...s, mealie_nightly_sync: value ? '1' : '0' }))}
        />

        {testResult && (
          <StatusBox ok={testResult.ok}>
            {testResult.ok ? <>Verbunden als {testResult.user}</> : testResult.error}
          </StatusBox>
        )}
        {errors.mealie && <StatusBox ok={false}>{errors.mealie}</StatusBox>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={test}
            disabled={testing || !settings.mealie_url}
            className={secondaryButtonClass}
          >
            <RefreshCw size={15} className={testing ? 'animate-spin' : ''} />
            Verbindung testen
          </button>
          <PrimaryButton onClick={() => save('mealie')} disabled={saving} done={saved} label="Speichern" />
        </div>
      </Section>

      {/* Einkaufsreihenfolge */}
      <Section id="shopping" icon="🛒" title="Einkaufsreihenfolge" open={open.has('shopping')} onToggle={toggle}>
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-[#c4c4c4]">Reihenfolge im Laden</p>
          <Hint className="mt-0">So wird die Einkaufsliste sortiert, passend zum Weg durch euren Supermarkt.</Hint>
          {categoryOrder.map((cat, i) => (
            <div key={cat} className="flex items-center gap-3 pl-3 pr-1 py-1 rounded-lg bg-[#0f0f0f] border border-[#262626]">
              <span className="text-xs text-[#8f8f8f] w-4 text-center tabular-nums">{i + 1}</span>
              <span className="flex-1 text-sm text-white">{CATEGORY_LABELS[cat] || cat}</span>
              <div className="flex">
                <button type="button" onClick={() => moveCat(i, -1)} disabled={i === 0}
                  aria-label={`${CATEGORY_LABELS[cat] || cat} nach oben`}
                  className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-[#222] text-[#a8a8a8] hover:text-white disabled:opacity-25 transition-all">
                  <ChevronUp size={16} />
                </button>
                <button type="button" onClick={() => moveCat(i, 1)} disabled={i === categoryOrder.length - 1}
                  aria-label={`${CATEGORY_LABELS[cat] || cat} nach unten`}
                  className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-[#222] text-[#a8a8a8] hover:text-white disabled:opacity-25 transition-all">
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          ))}
          {errors.shopping && <StatusBox ok={false}>{errors.shopping}</StatusBox>}
          <div className="pt-2">
            <PrimaryButton onClick={saveCategoryOrder} done={catOrderSaved} label="Reihenfolge speichern" />
          </div>
        </div>

        <div className="border-t border-[#262626] pt-4 space-y-3">
          <div>
            <p className="text-[13px] font-medium text-[#c4c4c4]">Eigene Kategorie-Wörter</p>
            <Hint className="mt-1">
              Die eingebauten deutschen, dänischen und englischen Wörter bleiben erhalten. Hier könnt ihr Wörter aus eurem Haushalt oder Supermarkt ergänzen.
            </Hint>
          </div>
          {CATEGORY_IDS.filter(cat => cat !== 'other').map(cat => (
            <div key={cat} className="rounded-lg bg-[#0f0f0f] border border-[#262626] p-3 space-y-2">
              <div>
                <p className="text-sm font-medium text-white">{CATEGORY_LABELS[cat]}</p>
                <p className="text-xs text-[#8f8f8f] mt-0.5">
                  {BUILT_IN_CATEGORY_KEYWORDS[cat].length} eingebaut, z. B. {BUILT_IN_CATEGORY_KEYWORDS[cat].slice(0, 7).join(', ')}
                </p>
              </div>
              {(customKeywords[cat]?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customKeywords[cat]!.map(keyword => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => removeCustomKeyword(cat, keyword)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] rounded-lg bg-[#1c1c1c] border border-[#333] px-3 text-sm text-[#d0d0d0] hover:text-white"
                      title="Wort entfernen"
                      aria-label={`${keyword} entfernen`}
                    >
                      {keyword}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={keywordDrafts[cat] ?? ''}
                  onChange={e => setKeywordDrafts(prev => ({ ...prev, [cat]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addCustomKeyword(cat)}
                  placeholder="Wort hinzufügen"
                  aria-label={`Wort für ${CATEGORY_LABELS[cat].replace(/^.+? /, '')} hinzufügen`}
                  className="h-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => addCustomKeyword(cat)}
                  className={`${secondaryButtonClass} flex-shrink-0`}
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          ))}
          {errors.keywords && <StatusBox ok={false}>{errors.keywords}</StatusBox>}
          <PrimaryButton onClick={saveCustomKeywords} done={keywordsSaved} label="Wörter speichern" />
        </div>
      </Section>

      {/* Home Assistant */}
      <Section
        id="ha" icon="🏠" title="Home Assistant" open={open.has('ha')} onToggle={toggle}
        meta={<>
          {settings.ha_url && <MetaText className="max-w-[120px]">{settings.ha_url.replace(/^https?:\/\//, '')}</MetaText>}
          {settings.has_ha_token && <span className="text-xs text-green-400">✓ Token gesetzt</span>}
        </>}
      >
        <div>
          <Label htmlFor="ha-url">Home-Assistant-Adresse</Label>
          <input
            id="ha-url"
            value={settings.ha_url}
            onChange={e => setSettings(s => ({ ...s, ha_url: e.target.value }))}
            placeholder="http://192.168.0.16:8123"
            disabled={settings.env?.ha_url}
            className="h-11"
          />
          {settings.env?.ha_url && <Hint>{envHint('HA_URL')}</Hint>}
        </div>
        <div>
          <Label htmlFor="ha-token">Langlebiges Zugriffstoken</Label>
          <input
            id="ha-token"
            value={settings.ha_token}
            onChange={e => setSettings(s => ({ ...s, ha_token: e.target.value }))}
            type="password"
            placeholder={settings.has_ha_token ? '••••••••' : 'eyJhbGci...'}
            disabled={settings.env?.ha_token}
            className="h-11"
          />
          <Hint>
            {settings.env?.ha_token ? envHint('HA_TOKEN') : 'HA → Profil → Sicherheit → Langlebige Zugriffstoken'}
          </Hint>
        </div>
        <div>
          <Label htmlFor="ha-entity">To-do-Liste (Entität)</Label>
          <input
            id="ha-entity"
            value={settings.ha_entity}
            onChange={e => setSettings(s => ({ ...s, ha_entity: e.target.value }))}
            placeholder="todo.google_keep_einkaufsliste"
            disabled={settings.env?.ha_entity}
            className="h-11"
          />
          <Hint>
            {settings.env?.ha_entity ? envHint('HA_ENTITY') : 'HA → Entwicklerwerkzeuge → Zustände → nach „todo.“ suchen.'}
          </Hint>
        </div>
        {errors.ha && <StatusBox ok={false}>{errors.ha}</StatusBox>}
        <PrimaryButton onClick={saveHa} disabled={saving} done={haSaved} label="Speichern" />
      </Section>

      {/* Benachrichtigungen */}
      <Section
        id="notify" icon="🔔" title="Benachrichtigungen" open={open.has('notify')} onToggle={toggle}
        meta={notifyDeviceCount > 0 && (
          <MetaText>{notifyDeviceCount} {notifyDeviceCount === 1 ? 'Gerät' : 'Geräte'}</MetaText>
        )}
      >
        {loaded ? (
          <NotificationsSection
            initial={notifyInitial}
            haConfigured={haConfigured}
            timezone={settings.timezone}
            profileNames={profileNames}
            textDefaults={settings.notify_text_defaults}
            authedFetch={authedFetch}
            softFetch={softFetch}
            onSaved={values => setSettings(s => ({ ...s, ...values }))}
          />
        ) : (
          <p className="text-sm text-[#a8a8a8]">Wird geladen …</p>
        )}
      </Section>

      {/* Nutzung */}
      <Section id="usage" icon="📊" title="Nutzung (30 Tage)" open={open.has('usage')} onToggle={toggle}>
        <UsageSection profileNames={profileNames} authedFetch={authedFetch} softFetch={softFetch} />
      </Section>

      {/* Über & Docker */}
      <Section id="about" icon="ℹ️" title="Über & Docker" open={open.has('about')} onToggle={toggle}>
        <div className="space-y-3 text-sm text-[#a8a8a8]">
          <p>Ein Essensplaner für zwei. Plant eure Woche, holt Rezepte aus Mealie und bekommt die Einkaufsliste automatisch.</p>
          <ul className="border-t border-[#262626] pt-3 space-y-1.5 text-xs text-[#9a9a9a] list-disc pl-4">
            <li>Rezepte liegen lokal in einer SQLite-Datenbank.</li>
            <li>Mealie-Rezepte werden gespiegelt: in Mealie bearbeiten, hier neu abgleichen.</li>
            <li>Die Einkaufsliste sortiert Zutaten automatisch nach Kategorien.</li>
            <li>Die Einkaufsliste lässt sich kopieren und mit allen teilen.</li>
            <li>Jeden Tag wird automatisch ein Backup in DATA_DIR/backups angelegt (14 Tage aufbewahrt).</li>
          </ul>
        </div>
        <button type="button" onClick={downloadBackup} className={secondaryButtonClass}>
          <Download size={15} />
          Datenbank-Backup herunterladen
        </button>
        <div className="bg-[#0f0f0f] border border-[#262626] rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-[#c4c4c4] mb-2">Docker-Umgebungsvariablen</p>
          <div className="font-mono text-xs text-[#a8a8a8] space-y-1 break-all">
            <p className="text-[#8a8a8a]"># Optional: Mealie vorkonfigurieren</p>
            <p>MEALIE_URL=https://mealie.example.com</p>
            <p>MEALIE_TOKEN=euer-token</p>
            <p className="text-[#8a8a8a]"># Optional: Home Assistant vorkonfigurieren</p>
            <p>HA_URL=http://homeassistant.local:8123</p>
            <p>HA_TOKEN=euer-token</p>
            <p>HA_ENTITY=todo.shopping_list</p>
            <p className="text-[#8a8a8a]"># Speicherort der Daten</p>
            <p>DATA_DIR=/app/data</p>
          </div>
        </div>
      </Section>
    </div>
  )
}
