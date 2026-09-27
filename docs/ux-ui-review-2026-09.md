# UX/UI-Review Vommeal (September 2026)

Stand: Commit `c264d4e`, 27.09.2026. Vier unabhängige Reviews und eine Kontrollrunde.

## Kurzfazit

Vommeal hat einen klaren Kern: die Heute-Karte, der Kochmodus, das Prüf-Sheet „Zutaten der Woche“, Rückgängig statt Rückfragen und das saubere Long-Press-Ziehen überzeugen alle vier Reviewer. Die größten Schwächen liegen im Umgang mit zwei gleichzeitig arbeitenden Personen und mit schlechtem Empfang. Sie lädt beim Zurückkehren nicht neu, überschreibt still die Planung des Partners und meldet Netzwerkfehler teilweise als Erfolg. Visuell sind es der zu geringe Kontrast der orangen Hauptknöpfe (2,80:1), fehlende Dialog-Semantik in den Sheets, das fehlende iOS-Safe-Area-Handling und viele feste Grauwerte statt Tokens. Im Ablauf fallen die doppelte Bedeutung von „Tauschen“, fünf verschiedene Wege für Zutaten auf die Liste und das Planungs-Sheet auf, in dem Enter sofort ein neues Rezept anlegt.

## Methode

| Reviewer | Rolle | Schwerpunkt |
|---|---|---|
| A | Senior Frontend Developer | Umsetzung: Barrierefreiheit, Zustände, PWA, Tokens, Performance |
| B | Senior Full-Stack Developer | Verhalten in echten Abläufen: Fehlerpfade, zwei Nutzer, Undo, Gesten |
| C | Senior UX Designer | Aufgabenabläufe, Informationsarchitektur, Begriffe, Onboarding |
| D | Senior UI Designer | Visuelle Hierarchie, Farbe und Kontrast, Typografie, Icons, Layout |

Die Reviewer haben unabhängig voneinander gearbeitet und die Berichte der anderen nicht gesehen. Grundlage war die laufende App (`next dev`, lokale SQLite mit 8 Testrezepten, 5 geplanten Abenden, Profilen Kilian und Susi, ohne Mealie und Home Assistant). Getestet wurde mit Playwright bei 320, 360, 390, 430, 820 und 1280 px Breite, dazu offline, mit Serverfehlern und mit Änderungen durch den zweiten Nutzer per API. Insgesamt gab es 75 Befunde (A 21, B 19, C 17, D 18).

**Kontrolle:** Jeder Befund der Priorität „hoch“ und alle Konsensbefunde wurden danach noch einmal direkt gegen den Code und per Kontrastrechnung geprüft (Abschnitt [Kontrolle](#kontrolle)). Wo ein Befund nur aus dem Code abgeleitet und nicht auf einem Gerät gesehen wurde, steht das dabei.

---

## Was gut läuft

- **Heute-Karte** (app/tonight/page.tsx): ein gefüllter Hauptknopf „Rezept öffnen“, ein Sekundärknopf, eine leise Textaktion. Die Hierarchie entspricht der Wichtigkeit. (C, D)
- **„Heute doch nicht“** direkt auf der Karte mit zwei Antworten und einem Satz zur Folge („Die nächsten geplanten Abende rutschen mit“). Undo stellt alle IDs und Daten exakt wieder her. (B, C)
- **Rückgängig statt Rückfrage:** Entfernen, Verschieben, Ziehen, Füllen und „Heute doch nicht“ haben 6 s Undo (app/page.tsx:437-491, :553-564; lib/planApi.ts:412-420). Autofill mit Undo reproduziert. (B, C)
- **Long-Press-Ziehen** ist sauber gegen Scrollen abgegrenzt: 350 ms Haltezeit, Abbruch ab 8 px Bewegung, Klick nach dem Ziehen unterdrückt (lib/useLongPressDrag.ts:19-20, :59-65, :153, :194-196). Schneller Wisch scrollt, langes Drücken tauscht, Undo stellt her. Das Ziehen hat mit „Verschieben“ eine Alternative per Tipp und Tastatur. (A, B)
- **Verschieben-Sheet** zeigt die Folgen vor der Aktion („Linsen → Sa, Tajine → So (Sonntag war frei)“), belegte Tage mit „tauschen“, vergangene deaktiviert (components/MoveSheet.tsx:266-268, :342-356). (B, C)
- **Einkaufsliste:** optimistisch mit echtem Rollback beim Abhaken und bei der Kategorie, Undo beim Entfernen wartet auf das laufende DELETE (app/shopping/page.tsx:232-308). Komma-Eingabe mit Fokus im Feld, fehlgeschlagene Namen kommen zurück ins Feld. Kategorien nach Ladenweg. Das ist die robusteste Fehlerbehandlung der App und das Vorbild für den Rest. (A, B, C)
- **„Zutaten der Woche“:** Mahlzeiten als Schalter, Zutaten nach Kategorie, bei jeder Zutat das Gericht, der Knopf nennt die Anzahl. Zutaten, die eine andere Mahlzeit braucht, bleiben beim Abschalten erhalten. Technisch das einzige vollständig zugängliche Sheet (`role="dialog"`, `aria-modal`, Scroll-Lock, Escape; app/shopping/page.tsx:1110-1115). (A, B, C)
- **Kochmodus:** große Schrift, ein Schritt pro Bildschirm, Knöpfe in Daumenreichweite, Wake Lock wird nach Tab-Wechsel neu angefordert, Safe Areas gesetzt (components/CookMode.tsx:50-60, :154). Von D als gelungenster Screen bewertet. (A, B, C, D)
- **Schnelloptionen** Reste, Auswärts essen, Bestellen, Frei decken reale Fälle mit einem Tipp ab. (C)
- **Semantik der Navigation:** `aria-current="page"`, sichtbare Labels, Icon-Buttons mit Kontext („Gemüsecurry verschieben“), genau ein `h1` pro Seite, `lang="de"`, Zoom nicht gesperrt, kein horizontales Scrollen bei 320 px. (A)
- **Konsistente Knopf-Grammatik** (primär gefüllt, sekundär mit Rahmen, tertiär Text, destruktiv rot getönt) und fast überall Touch-Ziele von 44 bis 52 px. (D)
- **Tablet-Layout** mit Seitenleiste, Wochenkarten in 2 und Rezepten in 3 Spalten. (D)
- **Benachrichtigungen mit Live-Vorschau** in den Einstellungen. (C)

---

## Konsensbefunde (von mindestens zwei Reviewern unabhängig gefunden)

Diese Befunde sind am belastbarsten, weil verschiedene Rollen mit verschiedenen Methoden zum selben Ergebnis kamen.

| # | Befund | Reviewer | Priorität | Kontrolle |
|---|---|---|---|---|
| K1 | Keine Aktualisierung beim Zurückkehren in die App: kein `visibilitychange`, `focus`, Polling oder SSE auf Woche, Heute und Einkauf. Änderungen des Partners erscheinen erst nach manuellem Neuladen, der Partner-Hinweis nur als 4-s-Toast beim ersten Laden. | A3, B2, C8 | hoch | bestätigt: einziger Listener in components/CookMode.tsx:55 |
| K2 | Weißer Text auf Orange (#fff auf #f97316) hat 2,80:1 und verfehlt WCAG AA, auch die 3:1 für großen Text. Betrifft 23 Stellen, darunter „freie Abende füllen“, „Rezept öffnen“, „Zutaten der Woche“ und den Avatar „K“. | A1, D1 | hoch | bestätigt: 2,80:1 nachgerechnet |
| K3 | Netzwerkfehler auf der Wochenseite: `removeEntry` hat kein try/catch (Karte verschwindet, Eintrag bleibt auf dem Server), `planMeal` kein finally (Picker bleibt nach Offline-Fehler dauerhaft deaktiviert). | A5, B4 | hoch | bestätigt: app/page.tsx:438-443, :352-365 |
| K4 | Kein Service Worker. Offline startet die App gar nicht, die Einkaufsliste zeigt bei Ladefehler „Die Liste ist leer“. | A4, B6 | hoch | bestätigt: public/ enthält nur manifest.json und icons/ |
| K5 | Top-Safe-Area fehlt: `statusBarStyle: 'black-translucent'` ohne `viewportFit: 'cover'`; `safe-area-inset-top` nur im Kochmodus. In der installierten iPhone-PWA liegen Titel voraussichtlich unter der Statusleiste, und `pb-safe` ist wirkungslos. | A12, D11 | hoch | im Code bestätigt (app/layout.tsx:19-28), nicht auf einem Gerät gesehen |
| K6 | Sheets der Wochenseite, MoveSheet und Kochmodus sind keine zugänglichen Dialoge: Fokus bleibt hinter dem Overlay, Tab läuft in den Hintergrund, kein Escape, kein Scroll-Lock, keine Fokus-Rückgabe. Das Overlay ist 9x kopiert. | A2, A7, A16 | hoch | bestätigt: `role="dialog"` nur in shopping, MoveSheet (ohne `aria-modal`) und CookMode |
| K7 | „Tauschen“ bedeutet zwei Dinge: auf der Karte „Gericht ersetzen“, beim Ziehen und im Verschieben-Sheet „zwei Tage vertauschen“. Das Ersetzen hat zudem als einzige Planaktion kein Undo. | C1, B12 | hoch | bestätigt: app/page.tsx:939, :1033 |
| K8 | Design-Tokens sind definiert, aber kaum genutzt: `text-white` 142x gegenüber `text-ink` 1x, rund 445 Klassen mit festen Hexwerten und rund 40 Grautöne. `slideUp` ist doppelt definiert (CSS überschreibt Tailwind), `--font-inter` wird nie gesetzt. | A13, D6, D16, D17 | mittel | bestätigt: tailwind.config.ts:42, app/globals.css |
| K9 | Hinweistext `ink-hint` #7a7a7a hat auf Karten 4,29:1 (unter AA), Checkbox-Rand #555 hat 2,47:1 (Nicht-Text braucht 3:1). | A14, D7 | mittel | bestätigt: 4,29:1 nachgerechnet |
| K10 | Zu viele Aktionen pro Wochenkarte: Warenkorb, Kalender-Uhr (Verschieben) ohne Label, „Tauschen“, X direkt daneben. Bei 7 Karten über 35 Tippziele. | C6, D13 | mittel | |
| K11 | Drei Toast-Kopien: der Einkaufs-Toast springt nach rund 200 ms seitlich, lange Namen schneiden das Verb ab („Omas legendärer Sonntagsbrate…“ ohne „entfernt“), Live-Region entsteht erst mit dem Text, Undo-Timer pausiert nicht. | A8, A9, B17 | mittel | |
| K12 | Nicht eingerichtete Dienste: Mealie-Abgleich meldet englisch „Error: Mealie not configured“, Keep ohne HA zeigt denselben Fehler doppelt (Balken und Toast), Hinweistexte versprechen „landet in Mealie“, obwohl lokal gespeichert wird. | C10, B16 | mittel | bestätigt: lib/mealie.ts:72 |
| K13 | Identität: Der Chip „Kilian ↻“ wechselt mit einem Tipp und ohne Rückfrage das Profil. Die Seite Heute fragt auf einem neuen Gerät gar nicht und schreibt als Profil 1. | C9, B13 | mittel | bestätigt: app/tonight/page.tsx:122-124 |
| K14 | `prefers-reduced-motion` wird nirgends berücksichtigt. | A10, D16 | mittel | |
| K15 | Enge Breiten: Bei 360 px wird „Nächste Woche“ abgeschnitten, bei 320 px ragt „Zutaten“ aus dem Viewport, der Planername wird zu „S“ gekürzt. | A18, D12 | mittel | |
| K16 | Einkaufsliste: leerer, unbeschrifteter Fortschrittsbalken bei 0 erledigten Einträgen; Kategorie-Icon und X in jeder Zeile erzeugen Icon-Rauschen und Fehltipps beim Scrollen. | C17, D9 | niedrig | |
| K17 | Rezeptdetail: „Löschen“ steht rot und gleichrangig neben „Bearbeiten“ (löscht auch in Mealie), die Mengenspalte zeigt bei Zutaten ohne Menge einen orangen Gedankenstrich. | C16, D10 | niedrig | |
| K18 | „Swipen“ hat keine Wischgeste (nur Knöpfe Nein und Ja) und schlägt gesperrte und bereits geplante Rezepte vor. | C11, B19, B11 | mittel | bestätigt: app/page.tsx:622-623 mischt alle Rezepte |

---

## Weitere Befunde nach Bereich

### Datenintegrität und zwei Nutzer (Developer B)

| ID | Priorität | Befund | Vorschlag |
|---|---|---|---|
| B1 | hoch | Planen auf einem veralteten Bildschirm überschreibt still das Gericht des Partners: `addMealPlanEntry` macht bei belegtem Datum ein UPDATE ohne Prüfung (lib/db.ts:508-528). Reproduziert: Susi plant Sa Shakshuka, Kilian plant auf altem Stand Sa Tajine, Shakshuka ist weg. | Erwarteten Zustand mitsenden (`expect_empty` bzw. `replace_id`), Server antwortet 409, Client fragt „Susi hat inzwischen Shakshuka geplant. Ersetzen?“ |
| B3 | hoch | X auf einer veralteten Karte meldet „entfernt“, obwohl nichts gelöscht wurde (DELETE antwortet immer `ok`, app/api/meal-plan/[id]/route.ts:39-43). Rückgängig überschreibt danach die neue Planung des Partners. | DELETE mit 404 bei unbekannter ID, Undo nur auf freie Tage (`only_if_empty`) |
| B5 | mittel | Serverfehler als Erfolg gemeldet: „Zutaten“ und Warenkorb melden bei 500 „Schon alles auf der Liste“, „Woche leeren“ meldet „Woche geleert“, obwohl nichts gelöscht wurde; Sternebewertung prüft `res.ok` nicht. | Ein gemeinsamer `apiCall`-Helfer: `res.ok` prüfen, `saving` immer zurücksetzen, Rollback, „Nochmal“ |
| B7 | mittel | Gleichzeitiges Abhaken hebt sich auf, weil der Server `checked = NOT checked` setzt (lib/db.ts:833-835). | PATCH mit Zielzustand `{checked: true/false}`, serverseitig idempotent |
| B8 | mittel | Duplikate: manuelles Hinzufügen gleicht nicht ab (Milch 2x), Singular und Plural werden nicht zusammengeführt (Banane/Bananen, Zwiebel/Zwiebeln). | Abgleich gegen offene Einträge mit Hinweis „Milch steht schon drauf“, einfache Pluralregeln im `mergeKey` |
| B9 | mittel | „Woche leeren“ löscht auch vergangene Tage der aktuellen Woche (app/page.tsx:612 nutzt `startStr`) und ist die einzige Planaktion mit `confirm()` statt Undo. Die Historie speist die 14-Tage-Regel und „Wie war's?“. | Nur ab heute löschen, Undo statt `confirm()` |
| B10 | mittel | Ein Stern bei „Wie war's?“ sperrt das Rezept dauerhaft für Vorschläge und Autofill (lib/suggest.ts:72), der Toast sagt nur „Danke fürs Bewerten!“, ohne Undo. | Sperre nur über „Nicht nochmal“, Toast mit Rückgängig |
| B14 | mittel | Der System-Zurück-Knopf verlässt im Kochmodus die Rezeptseite, Schritt und Häkchen sind verloren. | `pushState` beim Öffnen, `popstate` schließt nur den Kochmodus, Fortschritt in `sessionStorage` |
| B15 | niedrig | Rezeptseite bleibt offline endlos im Skelett, bei 404 stille Umleitung. | Fehlerzustand mit „Erneut laden“, „Rezept wurde gelöscht“ |
| B18 | niedrig | Der Hinweis „Susi hat N Abende geplant“ übersieht Ersetzungen, weil `created_at` beim UPDATE bleibt. | `updated_at` pflegen und auswerten |
| A6 | mittel | Nach fast jeder Aktion ersetzt `loadEntries` alle Karten kurz durch 60-px-Skeletons (Karten sind rund 100 px), die Seite springt zweimal. | Skeleton nur beim ersten Laden oder Wochenwechsel, sonst im Hintergrund aktualisieren |
| A21 | niedrig | Rollback mit `setItems(previous)` setzt bei zwei schnellen Haken auch den erfolgreichen zurück. | Rollback per Funktion nur für die betroffene ID |

### Abläufe und Informationsarchitektur (UX Designer C)

| ID | Priorität | Befund | Vorschlag |
|---|---|---|---|
| C2 | hoch | Aus dem Rezeptdetail kann man nicht planen. „Tajine am Donnerstag“ braucht 5 bis 6 Schritte mit Tabwechsel. | Knopf „Einplanen“ neben „Kochen“, Sheet mit den nächsten 10 Abenden |
| C3 | hoch | Fünf Wege für Zutaten auf die Liste mit unterschiedlicher Logik. Der Woche-Knopf „Zutaten“ schreibt direkt ohne Prüfschritt die angezeigte Woche, „Zutaten der Woche“ im Einkauf prüft und nimmt heute bis Ende nächster Woche. | Jeder Einstieg öffnet das Prüf-Sheet, vorgefiltert auf Tag oder Zeitraum; Woche-Knopf „Einkaufen“ |
| C4 | hoch | Im Planungs-Sheet steht „Neues Gericht“ über „Rezepte suchen“, beide Felder sehen gleich aus. Enter im ersten Feld legt sofort ein neues Rezept an (app/page.tsx:1079), also Duplikate, mit Mealie sogar dort. | Ein Feld „Gericht suchen oder neu eingeben“, Treffer zuerst, Neuanlage nur als letzter Eintrag, Enter legt nie ein Rezept an |
| C5 | mittel | Heute und Woche überlappen: Heute ist der erste Tab, die App startet aber auf Woche; der Kopfknopf „Heute“ führt zur aktuellen Woche statt zum Tab Heute, die am Sonntag nur „Vorbei · 6 Tage“ zeigt. | Start auf Heute, Kopfknopf „Diese Woche“; alternativ Heute in die Woche integrieren und 4 Tabs |
| C7 | mittel | Verschieben mischt zwei Modelle (Kette rutscht, Tagestausch), die Vorschau ist vierzeiliger Fließtext, der einzige Hinweis auf das Ziehen steht ganz unten im Verschieben-Sheet. | Vorher/Nachher-Liste, zwei klar getrennte Absichten, einmalige Coachmark für das Ziehen |
| C11 | mittel | Uneinheitliche Begriffe: „Keep“ für eine Home-Assistant-Liste, „Immer da“/„Vorrat“/„Vorrat verwalten“, „Frei“ als Eintrag und „frei“ als leerer Tag, „Aufwändig“ und „aufwendig“. | Glossar: „Abgleichen“, „Vorrat“ überall, „Abstimmen“, „Nichts kochen“, eine Schreibweise |
| C12 | mittel | Einstellungen sind für den nicht-technischen Partner ein Technikraum: 8 Bereiche mit eigenen Speichern-Knöpfen, API-Token, Entität, Slug, Docker. Die App-Adresse steht unter Benachrichtigungen, wird aber auch für Dashboard und Kalender gebraucht. Der Untertitel verspricht „Vorlieben“, die es nicht gibt. „Nutzung“ zeigt Rohschlüssel wie `week_next_open` (14 von 24 Ereignissen ohne Label). | Oben „Für euch“ (Profile, dieses Handy, Erinnerungen, Ladenreihenfolge), darunter eingeklappt „Verbindungen“; App-Adresse zentral; fehlende Labels ergänzen |
| C13 | niedrig | „Wer bist du?“ erklärt nicht, was die Wahl bedeutet; einziger Zusatztext ist ein Entwicklertipp zum Lesezeichen. | „Vommeal merkt sich auf diesem Handy, wer du bist. So sieht Susi, was du geplant hast.“ |
| C14 | niedrig | „Zutaten der Woche“: pro Mahlzeit Schalter und Link „Schon eingekauft“ ohne erklärten Unterschied, 21 gleiche „Immer da“-Links. | Nur Schalter, danach Rückfrage „Als schon eingekauft merken?“; „In den Vorrat“ erst nach Abwählen |
| C15 | niedrig | Derselbe Tag in fünf Schreibweisen („Montag 28.9.“, „Mi. 30.“, „Mo 28.9.“, „Di 29.“, „28. Sep.“). | Eine Formatfunktion: „Heute“/„Morgen“ relativ, sonst „Mi 30.9.“ |

### Visuelles Design (UI Designer D)

| ID | Priorität | Befund | Vorschlag |
|---|---|---|---|
| D3 | hoch | Ohne Bilder zeigt das Rezeptraster eine Wand identischer 🍽️-Kacheln, jede Wochenkarte einen 56-px-Teller. Das Emoji rendert je Plattform anders. | Farbton per Hash des Namens mit Initialen oder lucide-Icon; ohne Bild im Raster 16:9, in der Wochenkarte Thumb weglassen |
| D2 | mittel | Deaktivierte Primärknöpfe (`disabled:opacity-40`) wirken wie „aktiv, aber braun“ und sind der auffälligste Farbfleck auf Rezepte und Einkauf. | `disabled:bg-bg-border disabled:text-ink-hint`, wie bereits in app/shopping/page.tsx:1296 |
| D4 | mittel | Emoji und lucide als gemischtes Icon-System (Einstellungen, Kategorien, Schnelloptionen). | lucide durchgehend, einheitlich 18 px, Emoji höchstens bei Einkaufskategorien |
| D5 | mittel | Orange ohne Disziplin: auf der Woche konkurrieren Banner, CTA mit Glow, Avatar, jedes „+“ und der aktive Tab; im Zutaten-Sheet 6 orange Schalter plus CTA. Orange ist zugleich Kilians Personenfarbe. | Orange nur für Hauptaktion und Auswahl, Personenfarben getrennt vom Akzent |
| D8 | mittel | 15 Schriftgrößen inklusive 9 und 10 px, Seitentitel so groß wie das Hero-Gericht. | Skala mit 7 Stufen (Titel 28, Hero 22, Karte 17, Body 15, Label 13, Caption 12, Overline 11) |
| D14 | niedrig | Nur Dunkelmodus (`color-scheme: dark`, `className="dark"`, feste Hexwerte). In heller Küche und im Supermarkt ist ein heller Modus üblich. | Setzt K8 voraus; Palette in D14 des Einzelberichts |
| D15 | niedrig | Einstellungen als Stapel aus 8 Einzelkarten. | Gruppierte Liste im iOS-Stil mit Unterseiten |
| D18 | niedrig | Kartenkanten kaum sichtbar (Karte auf Hintergrund 1,07:1, Rand 1,23:1), das Suchfeld ist nur als Fläche erkennbar. | Surface #161616 mit Linie #2e2e2e, Eingaberand #3a3a3a |

### Technische Umsetzung (Developer A)

| ID | Priorität | Befund | Vorschlag |
|---|---|---|---|
| A11 | mittel | Eingabefelder global 14 px (app/globals.css:48), „Was fehlt?“ ohne `text-base`: iOS zoomt beim Antippen. | Basisgröße für Eingaben 1rem |
| A15 | niedrig | Rezeptbilder immer als `original.webp`, `next/image` überall `unoptimized` ohne `sizes`, auch für 40-px-Thumbnails. Nicht gemessen, weil die Testdaten keine Bilder hatten. | Mealie `min-original.webp` für Thumbnails oder Verkleinern im Bild-Proxy |
| A16 | niedrig | app/page.tsx hat 1443 Zeilen und 34 `useState`, Tastendruck in der Planer-Suche rendert alle Tageskarten neu. Viele der Befunde oben entstehen aus kopierten Bausteinen. | `DayCard` (memo), `PlannerSheet`, `Sheet`, `useToast`, `useMealPlan` auslagern |
| A17 | niedrig | Nach „Heute doch nicht“ liegt der Fokus auf `body`. | Fokus auf die Panel-Überschrift, bei „Abbrechen“ zurück |
| A19 | niedrig | Rezeptsuche und zwei Planerfelder nur mit Placeholder, editierbare Sterne ohne aktuellen Wert, Warenkorb auf Heute 37 px. | `aria-label`, Sterne als `radiogroup`, 44-px-Ziele |
| A20 | niedrig | Manifest: `"any maskable"` auf einem einzigen 192-px-Icon, kein 512-px-maskable, kein `id`, keine Screenshots. | Getrennte Einträge, `"id": "/"`, zwei Screenshots |

---

## Kontrolle

Nach den vier Reviews wurden die Kernaussagen direkt geprüft.

| Aussage | Ergebnis |
|---|---|
| Kontrast #fff auf #f97316 = 2,80:1; #fff auf #c2410c = 5,18:1; #7a7a7a auf #141414 = 4,29:1 | bestätigt (eigene Rechnung nach WCAG 2.x) |
| Kein Refetch bei Rückkehr in die App | bestätigt: kein `visibilitychange`, `focus`, `EventSource` oder Polling außerhalb des Kochmodus |
| Kein Service Worker | bestätigt |
| Kein `viewportFit`, Top-Safe-Area nur im Kochmodus | bestätigt; Wirkung auf dem iPhone nicht auf einem Gerät geprüft |
| Dialog-Semantik fehlt in den Sheets der Wochenseite | bestätigt: `role="dialog"` nur an drei Stellen, `aria-modal` nur in Einkauf und Kochmodus |
| Stilles Überschreiben beim Planen (B1) | bestätigt: UPDATE ohne Prüfung in lib/db.ts:508-528 |
| DELETE antwortet immer `ok` (B3) | bestätigt, aber unter app/api/meal-plan/[id]/route.ts:39-43 statt der im Einzelbericht genannten Zeilen 95-99 |
| Abhaken per `NOT checked` (B7) | bestätigt: lib/db.ts:833-835; `checkShoppingItem` existiert bereits |
| `removeEntry` ohne try/catch, `planMeal` ohne finally | bestätigt |
| „Woche leeren“ ab Wochenstart | bestätigt: app/page.tsx:612 |
| 1 Stern sperrt Rezept | bestätigt: lib/suggest.ts:72 filtert `rating !== 1` |
| Swipen mischt alle Rezepte | bestätigt: app/page.tsx:622-623 |
| Heute fällt auf Profil 1 zurück | bestätigt: app/tonight/page.tsx:122-124 |
| Enter im Feld „Neues Gericht“ legt Rezept an | bestätigt: app/page.tsx:1079 |
| „Tauschen“ = Ersetzen auf der Karte | bestätigt: app/page.tsx:939 und Sheet-Titel „Gericht tauschen“ :1033 |
| Englische Mealie-Fehlermeldung | bestätigt: lib/mealie.ts:72 |
| Eingabefelder 14 px | bestätigt: app/globals.css:48 |
| `--font-inter` nie gesetzt | bestätigt: tailwind.config.ts:42 |

**Einordnung der Belege:** B1 und B3 wurden mit einem per API simulierten zweiten Nutzer reproduziert. Die iOS-Befunde (K5, A11) sind aus dem Code abgeleitet und sollten einmal auf einem echten iPhone mit installierter PWA gegengeprüft werden. A15 ist nicht gemessen. Während der Tests hat Reviewer C einen Abend geplant und wieder entfernt; das hat keine Ergebnisse von B verfälscht.

**Widersprüche zwischen den Reviewern:** Keine inhaltlichen. Beim Kontrast schlagen A und D zwei Wege vor (dunkler Text auf Orange oder dunklere Buttonfläche). Empfehlung: Buttonfläche `primary-solid #c2410c` mit weißem Text (5,18:1), Orange #f97316 bleibt Text- und Akzentfarbe. Bei den Kartenaktionen (K10) schlagen C und D übereinstimmend ein Aktions-Sheet mit beschrifteten Einträgen vor.

---

## Empfohlene Reihenfolge

**Phase 1: Daten nicht verlieren** (klein, hoher Nutzen)
1. Konflikterkennung beim Planen und Entfernen (B1, B3): erwarteter Zustand, 409/404, Undo nur auf freie Tage.
2. Idempotentes Abhaken (B7) mit dem vorhandenen `checkShoppingItem`.
3. Gemeinsamer `apiCall`-Helfer nach dem Vorbild der Einkaufsliste (K3, B5, B15).
4. „Woche leeren“ nur ab heute und mit Undo (B9); 1 Stern sperrt nicht mehr still (B10); Enter legt kein Rezept an (C4).

**Phase 2: Gemeinsam und unterwegs nutzbar**
5. Neu laden bei Rückkehr in die App, Polling auf der Einkaufsliste, neue Abende des Partners markieren (K1, B18).
6. Einkaufsliste offline: Fehlerzustand statt „leer“, letzter Stand aus `localStorage`, danach Service Worker (K4).
7. Identität in einen Provider im Layout, Profilwechsel in die Einstellungen (K13).

**Phase 3: Zugänglichkeit und Plattform**
8. Eine gemeinsame `Sheet`-Komponente auf Basis von `<dialog>` für alle 9 Overlays und den Kochmodus (K6), dazu ein `useToast` (K11).
9. Kontrast (K2, K9), Safe Area (K5), Eingaben 16 px (A11), `prefers-reduced-motion` (K14), Kochmodus an der Browser-Historie (B14).

**Phase 4: Klarheit im Ablauf**
10. Begriffe: „Anderes Gericht“ statt „Tauschen“ (K7), Glossar (C11).
11. Ein Weg für Zutaten auf die Liste über das Prüf-Sheet (C3), „Einplanen“ aus dem Rezept (C2), Kartenaktionen in ein Aktions-Sheet (K10).
12. Nicht eingerichtete Dienste ausblenden oder ruhig erklären (K12), Einstellungen in „Für euch“ und „Verbindungen“ teilen (C12).

**Phase 5: Visuelles System**
13. Grautöne und Flächen als Tokens, Codemod gegen `-[#` (K8); darauf aufbauend Typografie-Skala (D8), Orange-Disziplin und Personenfarben (D5), lucide statt Emoji (D4), generierte Platzhalter (D3), später Hellmodus (D14).
