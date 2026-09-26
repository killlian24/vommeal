'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'

/**
 * Long-press drag and drop between day rows, built on pointer events so it
 * works for touch and mouse alike.
 *
 * - A press only turns into a drag after LONG_PRESS_MS without moving; until
 *   then the browser keeps scrolling normally (moving cancels the press).
 * - Once lifted, the card follows the pointer (translate + scale), scrolling
 *   is blocked via a non-passive touchmove listener on the list container,
 *   and the page auto-scrolls near the top/bottom edge.
 * - Drop targets are elements with `data-drop-date="YYYY-MM-DD"`.
 * - Escape, pointercancel or dropping outside a target cancels the drag.
 */

const LONG_PRESS_MS = 350
const MOVE_TOLERANCE = 8
const EDGE = 80
const MAX_SCROLL_SPEED = 16
const MOBILE_NAV_HEIGHT = 80 // fixed bottom navigation below md
const SINGLE_COLUMN_BELOW = 640 // the day grid gets a second column from `sm`

type Press = {
  id: string
  fromDate: string
  el: HTMLElement
  pointerId: number
  startX: number
  startY: number
  startScrollY: number
  x: number
  y: number
  active: boolean
  over: string | null
  timer: number
  raf: number
  cleanup: () => void
}

export type DragDrop = { id: string; from: string; to: string }

export function useLongPressDrag(opts: {
  onDrop: (drop: DragDrop) => void
  canDrop?: (date: string) => boolean
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overDate, setOverDate] = useState<string | null>(null)
  const press = useRef<Press | null>(null)
  const suppressClickUntil = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })

  // Block touch scrolling while a card is lifted. Must be non-passive and
  // registered before the touch starts, so it lives on the list container.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => { if (press.current?.active && e.cancelable) e.preventDefault() }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const resetStyles = (el: HTMLElement, animate: boolean) => {
    if (animate) {
      el.style.transition = 'transform 160ms ease-out'
      el.style.transform = ''
      window.setTimeout(() => { el.style.transition = '' }, 180)
    } else {
      el.style.transition = ''
      el.style.transform = ''
    }
    el.style.pointerEvents = ''
    el.style.zIndex = ''
    el.style.position = ''
  }

  const end = useCallback((mode: 'drop' | 'cancel') => {
    const p = press.current
    if (!p) return
    press.current = null
    window.clearTimeout(p.timer)
    cancelAnimationFrame(p.raf)
    p.cleanup()
    if (!p.active) return
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
    suppressClickUntil.current = Date.now() + 500
    setDragId(null)
    setOverDate(null)
    const target = mode === 'drop' ? p.over : null
    resetStyles(p.el, !target)
    if (target) optsRef.current.onDrop({ id: p.id, from: p.fromDate, to: target })
  }, [])

  // Cancel on unmount (e.g. navigating away mid-drag)
  useEffect(() => () => end('cancel'), [end])

  const position = (p: Press) => {
    // Phones show one column: the card only follows vertically there.
    const dx = window.innerWidth < SINGLE_COLUMN_BELOW ? 0 : p.x - p.startX
    const dy = p.y - p.startY + (window.scrollY - p.startScrollY)
    p.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`

    const hit = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('[data-drop-date]')
    let date = hit?.dataset.dropDate ?? null
    if (date === p.fromDate) date = null
    if (date && optsRef.current.canDrop && !optsRef.current.canDrop(date)) date = null
    if (date !== p.over) {
      p.over = date
      setOverDate(date)
    }
  }

  const autoScroll = (p: Press) => {
    if (!p.active || press.current !== p) return
    const bottomLimit = window.innerHeight - EDGE - (window.innerWidth < 768 ? MOBILE_NAV_HEIGHT : 0)
    let speed = 0
    if (p.y < EDGE) speed = -Math.ceil(((EDGE - p.y) / EDGE) * MAX_SCROLL_SPEED)
    else if (p.y > bottomLimit) speed = Math.ceil(Math.min(1, (p.y - bottomLimit) / EDGE) * MAX_SCROLL_SPEED)
    if (speed) {
      const before = window.scrollY
      window.scrollBy(0, speed)
      if (window.scrollY !== before) position(p)
    }
    p.raf = requestAnimationFrame(() => autoScroll(p))
  }

  const activate = (p: Press) => {
    if (press.current !== p) return
    p.active = true
    try { navigator.vibrate?.(10) } catch { /* not supported */ }
    window.getSelection?.()?.removeAllRanges()
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    p.el.style.position = 'relative'
    p.el.style.zIndex = '40'
    p.el.style.pointerEvents = 'none'
    p.el.style.transition = 'transform 120ms ease-out'
    setDragId(p.id)
    position(p)
    window.setTimeout(() => { if (press.current === p) p.el.style.transition = '' }, 130)
    p.raf = requestAnimationFrame(() => autoScroll(p))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, id: string, date: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (press.current) return
    // Buttons inside the card keep their own tap behaviour.
    if ((e.target as HTMLElement).closest('button')) return

    const onMove = (ev: PointerEvent) => {
      const p = press.current
      if (!p || ev.pointerId !== p.pointerId) return
      p.x = ev.clientX
      p.y = ev.clientY
      if (!p.active) {
        if (Math.hypot(p.x - p.startX, p.y - p.startY) > MOVE_TOLERANCE) end('cancel')
        return
      }
      position(p)
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === press.current?.pointerId) end('drop') }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === press.current?.pointerId) end('cancel') }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') end('cancel') }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)

    const p: Press = {
      id, fromDate: date, el: e.currentTarget, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY, startScrollY: window.scrollY,
      x: e.clientX, y: e.clientY, active: false, over: null, timer: 0, raf: 0,
      cleanup: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
      },
    }
    press.current = p
    p.timer = window.setTimeout(() => activate(p), LONG_PRESS_MS)
  }

  /** Props for a draggable card. */
  const bind = (id: string, date: string, enabled = true) => enabled ? {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => onPointerDown(e, id, date),
    // A long press must not end in a link tap, a context menu or a native drag.
    onClickCapture: (e: React.MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) { e.preventDefault(); e.stopPropagation() }
    },
    onContextMenu: (e: React.MouseEvent) => { if (press.current) e.preventDefault() },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  } : {}

  return { dragId, overDate, bind, containerRef }
}
