'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Avatar, avatarColor } from '@/components/Avatar'

// Who is using this phone. One place for the whole app: every page knows the
// person before it writes, nobody silently becomes profile 1. The choice is
// kept per phone in localStorage; /#name (e.g. a bookmark on /#susi) picks
// the profile directly.

const USER_KEY = 'vommeal_user'
// Profile names from the last successful load, so the app knows them offline
const USERS_KEY = 'vommeal_users'

type CurrentUser = {
  /** Profile name on this phone; '' until chosen. */
  user: string
  /** Ordered profiles (user1, user2), same order as the avatar colours. */
  users: string[]
  /** The other profile, or 'Partner'. */
  partner: string
  /** Profiles loaded (or loading failed). */
  ready: boolean
  setUser: (name: string) => void
  /** Show "Wer bist du?" (when profiles exist). */
  askUser: () => void
  /** Reload the profile names, e.g. after they were renamed in Einstellungen. */
  reloadUsers: () => Promise<void>
}

const Ctx = createContext<CurrentUser>({
  user: '', users: [], partner: 'Partner', ready: false,
  setUser: () => {}, askUser: () => {}, reloadUsers: async () => {},
})

export const useCurrentUser = () => useContext(Ctx)

function read(key: string): string {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

function cachedUsers(): string[] {
  try {
    const parsed = JSON.parse(read(USERS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string' && !!u) : []
  } catch { return [] }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState('')
  const [users, setUsers] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [picking, setPicking] = useState(false)

  const setUser = useCallback((name: string) => {
    setUserState(name)
    write(USER_KEY, name)
    setPicking(false)
  }, [])

  const resolve = useCallback((list: string[]) => {
    const hash = decodeURIComponent(window.location.hash.replace('#', '')).trim().toLowerCase()
    const fromHash = hash ? list.find(name => name.toLowerCase() === hash) : undefined
    if (fromHash) { setUser(fromHash); return }
    const stored = read(USER_KEY)
    if (stored && list.includes(stored)) { setUserState(stored); return }
    setUserState('')
    if (list.length > 0) setPicking(true)
  }, [setUser])

  const reloadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('settings load failed')
      const s = await res.json()
      const list = [s.user1_name, s.user2_name].filter((u): u is string => typeof u === 'string' && !!u.trim())
      setUsers(list)
      write(USERS_KEY, JSON.stringify(list))
      resolve(list)
    } catch {
      // Offline: trust what this phone knew last time, never ask blindly
      const list = cachedUsers()
      setUsers(list)
      const stored = read(USER_KEY)
      if (stored) setUserState(stored)
      else if (list.length > 0) setPicking(true)
    } finally {
      setReady(true)
    }
  }, [resolve])

  useEffect(() => {
    // Known person right away (also offline), confirmed once the profiles load
    const stored = read(USER_KEY)
    if (stored) setUserState(stored)
    reloadUsers()
  }, [reloadUsers])

  const askUser = useCallback(() => { if (users.length > 0) setPicking(true) }, [users])
  const partner = users.find(u => u !== user) || 'Partner'

  return (
    <Ctx.Provider value={{ user, users, partner, ready, setUser, askUser, reloadUsers }}>
      {children}
      {picking && users.length > 0 && <WhoAreYou users={users} onPick={setUser} />}
    </Ctx.Provider>
  )
}

// Full-screen "Wer bist du?" on first use of a phone
function WhoAreYou({ users, onPick }: { users: string[]; onPick: (name: string) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="who-title"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#0a0a0a]">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(249,115,22,0.08) 0%, transparent 70%)'
      }} />

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-sm animate-slide-up">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-8 shadow-lg shadow-primary/20">
          <span className="text-xl">🍽️</span>
        </div>

        <h1 id="who-title" className="text-2xl font-bold text-white mb-1 tracking-tight">Wer bist du?</h1>
        <p className="text-sm text-ink-muted mb-10 text-center">
          Vommeal merkt sich auf diesem Handy, wer du bist.
        </p>

        <div className="w-full space-y-3">
          {users.map(u => {
            const color = avatarColor(u, users)
            const other = users.find(x => x !== u)
            return (
              <button key={u} onClick={() => onPick(u)}
                className="w-full group relative flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: `${color}1f`, border: `1px solid ${color}40`, boxShadow: `0 0 24px ${color}26` }}>
                <Avatar name={u} users={users} size="xl" />
                <div className="flex-1 text-left">
                  <p className="text-base font-semibold text-white">{u}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {other ? `So sieht ${other}, was du geplant hast.` : `Weiter als ${u}`}
                  </p>
                </div>
                <span className="text-ink-muted group-hover:text-white transition-colors text-lg">→</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
