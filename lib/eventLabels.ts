// German names for the usage log in Einstellungen (Nutzung).

// Every event name in the app (grep "track(" and "trackServer("); anything
// else is counted under "Sonstige".
export const EVENT_LABELS: Record<string, string> = {
  plan_add: 'Abend geplant',
  plan_replace: 'Anderes Gericht gewählt',
  plan_replace_undo: 'Ersetzen rückgängig gemacht',
  plan_remove: 'Abend entfernt',
  plan_leftovers: 'Reste für morgen eingeplant',
  plan_shift: 'Abende verschoben',
  plan_move: 'Auf anderen Tag verschoben',
  plan_drag: 'Karte gezogen',
  plan_clear: 'Woche geleert',
  autofill: 'Woche gefüllt',
  week_next_open: 'Nächste Woche geöffnet',
  fun_open: 'Abstimmen geöffnet',
  fun_vote: 'Stimmen abgegeben',
  tonight_suggest_pick: 'Heute-Vorschlag übernommen',
  tonight_quick: 'Heute ohne Kochen',
  rating_prompt: 'Bewertet',
  never_again_set: '„Nicht nochmal“ geändert',
  effort_set: 'Aufwand festgelegt',
  recipe_create: 'Rezept angelegt',
  recipe_import: 'Rezept importiert',
  recipe_delete: 'Rezept gelöscht',
  recipe_plan_open: 'Aus dem Rezept eingeplant',
  cook_mode_open: 'Kochmodus',
  shopping_review_open: 'Zutaten der Woche geöffnet',
  shopping_from_plan: 'Einkaufen aus der Woche',
  shopping_add: 'Zutaten auf die Liste',
  shopping_meal_toggle: 'Mahlzeit ein- oder ausgeschaltet',
  shopping_meal_mark_bought: 'Als eingekauft gemerkt',
  shopping_manual_add: 'Von Hand eingetragen',
  shopping_offline_flush: 'Offline-Änderungen gesendet',
  shopping_send_keep: 'Abgeglichen nach Zutaten der Woche',
  pantry_add: 'In den Vorrat gelegt',
  notify_action: 'Knopf in einer Erinnerung',
}

export const OTHER_LABEL = 'Sonstige'

/** Counts per German label; unknown event names add up under "Sonstige". */
export function countByLabel(byName: Record<string, number> | undefined): [string, number][] {
  const totals = new Map<string, number>()
  for (const [name, count] of Object.entries(byName ?? {})) {
    if (typeof count !== 'number' || count <= 0) continue
    const label = EVENT_LABELS[name] ?? OTHER_LABEL
    totals.set(label, (totals.get(label) ?? 0) + count)
  }
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
}
