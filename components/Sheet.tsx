'use client'

import { createContext, useContext, useId, useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { lockScroll, unlockScroll } from '@/lib/scrollLock'
import { ToastRegion } from '@/components/Toast'

// Every overlay of the app: a modal <dialog> (showModal), so focus stays
// inside, Escape closes it and the page behind is inert. Mounted = open; the
// caller renders it conditionally. On close, focus goes back to whatever
// opened it. Looks: bottom sheet on phones, centred card from `centerFrom`
// on (styles in app/globals.css).

type Ctx = { titleId: string; onClose: () => void; dismissible: boolean }
const SheetCtx = createContext<Ctx | null>(null)

/** Panel look shared by the bottom sheets; `width` e.g. 'max-w-sm'. */
export const sheetPanel = (width = 'max-w-md') =>
  `w-full ${width} flex flex-col bg-[#141414] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl pb-safe`

export function Sheet({
  onClose, dismissible = true, closeOnScrim = true, labelledBy, initialFocus, placement = 'sheet', centerFrom = 'sm',
  className = sheetPanel(), onKeyDown, children,
}: {
  onClose: () => void
  /** false while saving: Escape and the scrim do nothing, the close button is up to the caller */
  dismissible?: boolean
  /** false: a tap next to the panel does nothing (Escape still closes) */
  closeOnScrim?: boolean
  /** Id of the title; by default SheetHeader / SheetTitle provide it */
  labelledBy?: string
  /** Gets focus on open; otherwise the panel itself (screen readers read the title) */
  initialFocus?: RefObject<HTMLElement | null>
  placement?: 'sheet' | 'center' | 'fullscreen'
  centerFrom?: 'sm' | 'md'
  /** Panel classes (width, colours, radius); defaults to sheetPanel() */
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLDialogElement>) => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const autoId = useId()
  const titleId = labelledBy ?? `${autoId}title`
  // The native listeners below live as long as the dialog; they read these.
  const latest = useRef({ onClose, dismissible })
  latest.current = { onClose, dismissible }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let closing = false
    dialog.showModal()
    lockScroll()
    ;(initialFocus?.current ?? panelRef.current)?.focus({ preventScroll: true })

    // Escape: React state decides, the dialog never closes on its own
    const onCancel = (e: Event) => {
      e.preventDefault()
      if (latest.current.dismissible) latest.current.onClose()
    }
    // Closed by the browser anyway (Chrome does after repeated Escape). The
    // event is queued: a late one from an earlier close() (React dev mode
    // opens effects twice) finds the dialog open again and is ignored.
    const onNativeClose = () => {
      if (closing || dialog.open) return
      if (latest.current.dismissible) latest.current.onClose()
      else dialog.showModal()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onNativeClose)
    return () => {
      closing = true
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onNativeClose)
      if (dialog.open) dialog.close()
      unlockScroll()
      if (trigger?.isConnected && trigger !== document.body) trigger.focus({ preventScroll: true })
    }
    // Opens once per mount; later prop changes are read through `latest`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null

  // A modal dialog lets Tab leave for the browser's own controls after the
  // last element; here it wraps around instead.
  const trapTab = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return
    const items = tabbables(e.currentTarget)
    const active = document.activeElement as HTMLElement | null
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const dismiss = () => { if (dismissible && closeOnScrim) onClose() }
  const panel = (
    <div ref={panelRef} tabIndex={-1}
      className={placement === 'fullscreen' ? `h-full focus:outline-none ${className}` : `sheet-panel relative focus:outline-none ${className}`}>
      {children}
    </div>
  )

  // Portal to <body>: parent styles (space-y margins, transforms) must not touch it
  return createPortal(
    <SheetCtx.Provider value={{ titleId, onClose, dismissible }}>
      <dialog ref={dialogRef} aria-labelledby={titleId} onKeyDown={e => { trapTab(e); onKeyDown?.(e) }}
        className={placement === 'fullscreen' ? 'sheet sheet-fullscreen' : 'sheet'}
        data-placement={placement} data-center-from={centerFrom}>
        {placement === 'fullscreen' ? panel : (
          // Tap on the scrim (around the panel) closes
          <div onClick={e => { if (e.target === e.currentTarget) dismiss() }}
            className={`h-full flex justify-center ${
              placement === 'center' ? 'items-center p-4'
                : centerFrom === 'md' ? 'items-end md:items-center' : 'items-end sm:items-center sm:p-4'
            }`}>
            {panel}
          </div>
        )}
        <ToastRegion />
      </dialog>
    </SheetCtx.Provider>,
    document.body,
  )
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Elements Tab can reach inside `root`, in order (hidden ones left out). */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE))
    .filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0)
}

/** The sheet's title, wired to aria-labelledby. */
export function SheetTitle({ className = 'font-semibold text-white', children }: { className?: string; children: React.ReactNode }) {
  const ctx = useContext(SheetCtx)
  return <h2 id={ctx?.titleId} className={className}>{children}</h2>
}

/** Standard header: title, optional subtitle, close button. */
export function SheetHeader({ title, subtitle, closeDisabled }: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  closeDisabled?: boolean
}) {
  const ctx = useContext(SheetCtx)
  return (
    <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-[#222] flex-shrink-0">
      <div className="min-w-0">
        <SheetTitle>{title}</SheetTitle>
        {subtitle && <p className="text-sm text-ink-muted truncate">{subtitle}</p>}
      </div>
      <SheetClose disabled={closeDisabled || !ctx?.dismissible} />
    </div>
  )
}

/** X button; 40 px to look at, 44 px to hit. */
export function SheetClose({ disabled, className = '', size = 18 }: { disabled?: boolean; className?: string; size?: number }) {
  const ctx = useContext(SheetCtx)
  return (
    <button type="button" onClick={ctx?.onClose} disabled={disabled} aria-label="Schließen"
      className={`relative after:absolute after:-inset-0.5 w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg transition-all text-ink-muted hover:text-white hover:bg-[#222] disabled:opacity-40 ${className}`}>
      <X size={size} />
    </button>
  )
}
