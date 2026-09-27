/**
 * Client-safe constants for the Home Assistant dashboard (settings page,
 * README). The push itself lives in lib/haDashboard.ts (server only).
 */

export const SENSOR_IDS = {
  heute: 'sensor.vommeal_heute',
  morgen: 'sensor.vommeal_morgen',
  woche: 'sensor.vommeal_woche',
} as const

/**
 * Ready-to-paste dashboard card. Tile cards instead of a picture-entity card:
 * a tile shows the recipe photo as its round icon when there is one and falls
 * back to the fork-and-knife icon otherwise (a picture-entity card stays an
 * empty grey box on evenings without a photo).
 */
export const DASHBOARD_CARD_YAML = `type: vertical-stack
cards:
  - type: tile
    entity: ${SENSOR_IDS.heute}
    name: Heute
    show_entity_picture: true
  - type: tile
    entity: ${SENSOR_IDS.morgen}
    name: Morgen
    show_entity_picture: true
  - type: markdown
    title: Diese Woche
    content: "{{ state_attr('${SENSOR_IDS.woche}', 'markdown') or 'Noch keine Daten von Vommeal' }}"
`

export const CALENDAR_PATH = '/api/calendar.ics'

/** Feed address from the app address, else from the address the page was opened with. */
export function calendarFeedUrl(appUrl: string, origin: string): string {
  const base = (appUrl.trim() || origin).replace(/\/+$/, '')
  return `${base}${CALENDAR_PATH}`
}
