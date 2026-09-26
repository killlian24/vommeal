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

export function movePlanEntry(id: string, to: string) {
  return post<{ moves: PlanMove[] }>('/api/meal-plan/move', { id, to })
}

/**
 * Undo a shift/move: remove the evening that was planned on the freed day
 * (if any), then put every moved entry back on its old date.
 */
export async function undoPlanChange(moves: PlanMove[], createdId?: string | null) {
  if (createdId) {
    const res = await fetch(`/api/meal-plan/${createdId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Konnte nicht zurückgenommen werden')
  }
  if (moves.length > 0) {
    await post('/api/meal-plan/reorder', { moves: moves.map(m => ({ id: m.id, date: m.from })) })
  }
}
