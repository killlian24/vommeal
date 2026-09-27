import { describe, it, expect } from 'vitest'
import { friendlyError, germanError } from '../lib/errorText'

describe('friendlyError', () => {
  it('translates "not configured" and names the service to set up', () => {
    expect(friendlyError('Error: Mealie not configured')).toEqual({ message: 'Mealie ist noch nicht eingerichtet', setup: 'mealie' })
    expect(friendlyError('Home Assistant not configured. Add your credentials in Settings.'))
      .toEqual({ message: 'Home Assistant ist noch nicht eingerichtet', setup: 'ha' })
    expect(friendlyError(new Error('Mealie not configured')).setup).toBe('mealie')
  })

  it('reports unreachable services with the service from the call', () => {
    expect(germanError('TypeError: fetch failed', { service: 'mealie' })).toBe('Mealie ist gerade nicht erreichbar')
    expect(germanError('Cannot reach Home Assistant: connect ECONNREFUSED 10.0.0.2:8123')).toBe('Home Assistant ist gerade nicht erreichbar')
  })

  it('translates refused access and running syncs', () => {
    expect(germanError('HA /api/states returned 401: Unauthorized')).toBe('Home Assistant hat den Zugriff verweigert, bitte den Token prüfen')
    expect(germanError('Sync already running')).toBe('Abgleich läuft gerade schon, gleich nochmal versuchen')
  })

  it('turns bare status codes into a short German sentence', () => {
    expect(germanError('Mealie 500 on PUT /api/users/ratings/x')).toBe('Mealie antwortet mit Fehler 500')
    expect(germanError('HTTP 502', { service: 'ha' })).toBe('Home Assistant antwortet mit Fehler 502')
  })

  it('passes German texts from the API through', () => {
    expect(germanError('Auf dieser Seite wurde kein Rezept gefunden')).toBe('Auf dieser Seite wurde kein Rezept gefunden')
    expect(germanError('Bitte einen Namen angeben')).toBe('Bitte einen Namen angeben')
  })

  it('falls back for unknown English and empty errors', () => {
    expect(germanError('Mealie returned no recipe slug', { fallback: 'Import hat nicht geklappt' })).toBe('Import hat nicht geklappt')
    expect(germanError('', { fallback: 'Hoppla' })).toBe('Hoppla')
    expect(germanError(undefined)).toBe('Hat nicht geklappt')
  })
})
