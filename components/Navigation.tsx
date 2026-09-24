'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, BookOpen, ShoppingCart, Settings, Utensils, Moon } from 'lucide-react'

const links = [
  { href: '/tonight',  label: 'Heute',         icon: Moon },
  { href: '/',         label: 'Woche',         icon: CalendarDays },
  { href: '/recipes',  label: 'Rezepte',       icon: BookOpen },
  { href: '/shopping', label: 'Einkauf',       icon: ShoppingCart },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col bg-[#0f0f0f] border-r border-[#1e1e1e] z-40">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#1e1e1e]">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Utensils size={15} className="text-white" />
          </div>
          <span className="font-semibold text-base text-white tracking-tight">Vommeal</span>
        </div>
        <nav className="flex-1 py-3 px-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-ink-muted hover:text-ink hover:bg-[#1c1c1c]'
                }`}
              >
                <Icon size={17} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-5 py-4 border-t border-[#1e1e1e]">
          <p className="text-xs text-ink-hint">Nur für uns zwei</p>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f0f0f]/95 backdrop-blur-md border-t border-[#1e1e1e] pb-safe">
        <div className="flex items-stretch justify-around px-1 py-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 min-w-0 min-h-[52px] flex flex-col items-center justify-center gap-1 px-0.5 rounded-xl transition-all ${
                  active ? 'text-primary' : 'text-ink-muted'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[11px] tracking-tight font-medium leading-none max-w-full truncate">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
