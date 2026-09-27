'use client'

import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { useCurrentUser } from '@/components/UserProvider'
import { Hint, secondaryButtonClass } from './ui'

// "Dieses Handy gehört: Kilian". Switching needs a confirmation, so nobody
// plans as the other person by a stray tap.
export function ThisPhone() {
  const { user, users, partner, setUser, askUser } = useCurrentUser()
  const [confirming, setConfirming] = useState(false)
  if (users.length === 0) return null

  const other = users.find(u => u !== user)
  const change = () => {
    if (!user || !other) { askUser(); return }
    setConfirming(true)
  }

  return (
    <div className="rounded-lg border border-[#262626] bg-[#101010] px-3 py-2.5">
      <div className="flex items-center gap-3">
        {user ? <Avatar name={user} users={users} size="lg" /> : <div className="w-8 h-8 rounded-full bg-[#222] border border-[#3a3a3a] flex-shrink-0" />}
        <p className="flex-1 min-w-0 text-sm text-[#c4c4c4]">
          Dieses Handy gehört: <span className="font-semibold text-white">{user || 'noch niemandem'}</span>
        </p>
        {!confirming && (
          <button type="button" onClick={change} className={secondaryButtonClass}>
            {user ? 'Ändern' : 'Auswählen'}
          </button>
        )}
      </div>
      {confirming && other && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-white">Als {other} weitermachen?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={`${secondaryButtonClass} flex-1`}>Abbrechen</button>
            <button type="button" onClick={() => { setUser(other); setConfirming(false) }}
              className="flex-1 min-h-[44px] px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors">
              Ja, als {other}
            </button>
          </div>
        </div>
      )}
      <Hint>
        Was du planst, sieht {user ? partner : 'die andere Person'} mit deinem Namen.
        Tipp: Ein Lesezeichen auf <span className="font-mono text-[#c4c4c4]">/#{(user || users[0]).toLowerCase()}</span> wählt
        die Person auf einem neuen Gerät direkt, ohne Frage.
      </Hint>
    </div>
  )
}
