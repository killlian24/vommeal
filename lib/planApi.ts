// Client helpers for moving planned evenings (see app/api/meal-plan/{shift,move,reorder}).
import type { PlanMove } from './planMoves'

export type ShiftResponse = {
  moves: PlanMove[]
  filled: { id: string; date: string; custom_meal_name: string | null } | null
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Konnte nicht verschoben werden')
  return data as T
}

export function shiftPlan(body: { from: string; days: 1 | -1; fill?: string | null; suggested_by?: string }) {
  return post<ShiftResponse>('/api/meal-plan/shift', body)
}

/** `by` is the person on this phone; the partner's phone marks the evening as changed. */
export function movePlanEntry(id: string, to: string, by = '') {
  return post<{ moves: PlanMove[] }>('/api/meal-plan/move', { id, to, by })
}

/**
 * Undo a shift/move: remove the evening that was planned on the freed day
 * (if any), then put every moved entry back on its old date.
 */
export async function undoPlanChange(moves: PlanMove[], createdId?: string | null, by = '') {
  if (createdId) {
    const res = await fetch(`/api/meal-plan/${createdId}`, { method: 'DELETE' })
    // 404: that evening was already removed or replaced, nothing left to take back.
    if (!res.ok && res.status !== 404) throw new Error('Konnte nicht zurückgenommen werden')
  }
  if (moves.length > 0) {
    await post('/api/meal-plan/reorder', { moves: moves.map(m => ({ id: m.id, date: m.from })), by })
  }
}
