# Vommeal

Essensplaner als Web-App (PWA) für zwei: Wochenplan, Rezepte aus Mealie, Einkaufsliste mit Abgleich zu Home Assistant bzw. Google Keep, persönliche Erinnerungen mit Knöpfen, Wochenplan im Home-Assistant-Dashboard und als Kalender.

- [Was Vommeal kann](#was-vommeal-kann)
- [Installation](#installation) · [Einrichtung](#einrichtung-in-der-app) · [Benachrichtigungen](#benachrichtigungen) · [Home Assistant Dashboard](#home-assistant-dashboard)
- [Updates](#updates) · [Backup](#backup) · [Fehlerbehebung](#fehlerbehebung) · [Lokale Entwicklung](#lokale-entwicklung)

---

## Was Vommeal kann

Vommeal ist fürs Handy gebaut: auf dem Startbildschirm installieren, unten gibt es die Bereiche **Heute**, **Woche**, **Rezepte**, **Einkauf** und **Einstellungen**. Beim ersten Öffnen fragt Vommeal auf jeder Seite „Wer bist du?“, bevor etwas gespeichert wird; die Auswahl gilt pro Gerät. Wer das Handy benutzt, steht unter **Einstellungen → Profile** („Dieses Handy gehört: Kilian“) und lässt sich dort mit **Ändern** und einer Rückfrage wechseln (ein Lesezeichen auf `/#name` überspringt die Frage auf einem neuen Gerät).

Kommt man zurück in die App (oder ist wieder online), laden Woche, Heute und Einkauf im Hintergrund neu, ohne dass offene Fenster zugehen. Die Einkaufsliste holt sich zusätzlich alle 20 Sekunden die Änderungen des anderen.

### Woche

- **Planen ohne Bestätigen:** Jeder plant einfach, jede Karte zeigt, wer geplant hat. Hat der andere seit dem letzten Blick auf dieses Handy Abende geplant, ersetzt oder verschoben, erscheint ein kurzer Hinweis („Susi hat 3 Abende geplant“) und die Karten tragen ein kleines **neu**, bis man die Woche gesehen hat (höchstens 24 Stunden).
- **Aktuelle und nächste Woche:** Von Freitag bis Sonntag öffnet die Woche automatisch die nächste Woche, oben bleibt „Heute: …“ sichtbar. Vergangene Tage sind unter „Vorbei“ eingeklappt, ab Donnerstag gibt es die Karte „Nächste Woche planen“.
- **Abend planen:** Antippen öffnet die Auswahl mit Rezeptsuche, den Schnelloptionen **Reste**, **Auswärts essen**, **Bestellen** und **Frei** sowie einem Feld für ein neues Gericht. Ein neues Gericht („Schnitzel“) wird mit **Als Rezept anlegen & planen** direkt in Mealie angelegt (in der Abendessen-Kategorie) oder mit **Nur Notiz** nur für diesen Abend eingetragen. **Reste für morgen einplanen** trägt gleich für den nächsten Abend „Reste“ ein.
- **Freie Abende füllen:** Der große Knopf füllt alle freien Abende ab heute automatisch (nichts mit „Nicht nochmal“, schlecht bewertete nur wenn nötig, nichts aus den letzten 14 Tagen, montags bis donnerstags bevorzugt schnelle Rezepte). Rückgängig ist möglich.
- **Verschieben:** Jede Karte hat **Verschieben** mit
  - **Ab hier 1 Tag später:** Das Gericht und alle direkt folgenden rutschen einen Tag nach hinten, bis zum nächsten freien Abend. Der frei gewordene Abend kann gleich „Auswärts essen“ bekommen (z. B. bei einer spontanen Einladung).
  - **1 Tag früher**, wenn der Vortag frei ist.
  - **Auf anderen Tag:** Tag antippen; ist er belegt, werden die Gerichte getauscht.

  Alternativ lange auf eine Karte drücken und sie auf einen anderen Tag ziehen. Alles lässt sich 6 Sekunden lang rückgängig machen; die Zuordnung zur Einkaufsliste bleibt erhalten.
- **Tauschen:** ersetzt das Gericht eines Abends. Wird dabei für heute „Auswärts essen“ oder „Bestellen“ gewählt, rutscht das bisherige Gericht automatisch auf morgen.
- **Swipen:** gemeinsames Abstimmen wie bei einer Dating-App: pro Tag drei Rezepte, jeder stimmt auf seinem Handy ab, gemeinsame Treffer werden automatisch geplant.
- **Zutaten:** schickt die Zutaten der Woche auf die Einkaufsliste (ausführlicher unter [Einkauf](#einkauf)). **Woche leeren** unten entfernt alle Planungen der Woche.

### Heute

- Zeigt das heutige Gericht mit **Rezept öffnen** und **Zutaten auf die Einkaufsliste**, darunter die nächsten Tage. Hat der andere das heutige Gericht geplant oder geändert, gibt es einen Hinweis und ein **neu** an der Karte.
- **Heute doch nicht – auf morgen schieben:** schiebt heute und die folgenden Tage einen Tag nach hinten und trägt für heute wahlweise „Auswärts essen“ ein oder lässt den Abend frei.
- Ist nichts geplant: drei Vorschläge mit **Heute kochen** (nach denselben Regeln wie die Erinnerung), **Andere Vorschläge** und die Schnelloptionen.
- **Wie war's?** fragt am Tag danach einmal nach Sternen. **Nicht nochmal** (1 Stern) sorgt dafür, dass das Rezept nicht mehr vorgeschlagen oder automatisch geplant wird. Bewertungen gehen auch an Mealie.

### Rezepte

- Rezepte kommen aus Mealie (gefiltert auf die Abendessen-Kategorie). Der Abgleich läuft jede Nacht und per Knopf auf der Seite **Rezepte**. Neue und geänderte Rezepte werden übernommen, in Mealie gelöschte Rezepte verschwinden auch in Vommeal, ein ersetztes Rezeptbild erscheint nach dem nächsten Abgleich. Sicherheitsbremse: Liefert Mealie gar nichts oder würde mehr als die Hälfte auf einmal verschwinden, löscht Vommeal nichts und zeigt einen Hinweis.
- **Neues Rezept** (Plus auf der Seite Rezepte oder beim Planen) legt das Rezept direkt in Mealie an, mit Beschreibung, Zutaten und Schritten.
- **Rezept per Link hinzufügen:** Link einfügen oder auf Android über „Teilen“ an Vommeal schicken, Mealie liest die Seite aus (siehe [Rezept per Link importieren](#rezept-per-link-importieren)).
- **Löschen** auf der Rezeptseite löscht das Rezept nach Rückfrage auch in Mealie. Geplante Abende behalten den Namen.
- **Kochen** öffnet den Kochmodus: erst die Zutaten zum Abhaken, dann ein Schritt pro Bildschirm in großer Schrift; der Bildschirm bleibt dabei an.
- **Schnell / Aufwändig** markiert Rezepte für Filter und Vorschläge. Bewertungen, Suche und Filter gibt es auf der Rezeptliste.

### Einkauf

- **Eintragen:** Das Feld „Was fehlt?“ bleibt nach Enter offen, mehrere Einträge gehen mit Komma („Banane, Milch, Brot“). Ein kurzer Hinweis zeigt, in welcher Kategorie der Eintrag gelandet ist.
- **Kategorien:** Vommeal sortiert Einträge automatisch in Obst & Gemüse, Fleisch & Fisch, Milchprodukte & Eier, Brot & Nudeln, Trockenware & Konserven, Tiefkühl, Getränke und Sonstiges (Deutsch, Englisch und Dänisch; das spezifischste Wort gewinnt, also Erdbeeren zu Obst, Zahnpasta zu Sonstiges). Kategorie antippen ändert sie; eigene Wörter pro Kategorie und die Reihenfolge der Kategorien stehen unter **Einstellungen → Einkaufsreihenfolge**.
- **Zutaten der Woche:** sammelt die Zutaten aller geplanten Rezepte von heute bis Ende nächster Woche, ohne Mengen, gleiche Zutaten aus mehreren Rezepten zusammengefasst („für Linsen, Tajine“).
  - Oben stehen die **Mahlzeiten** als Schalter („Sa · Linsen mit Spätzle · 4 von 6“). Eine Mahlzeit abschalten wählt ihre Zutaten ab; was eine andere Mahlzeit noch braucht, bleibt drin.
  - Vommeal merkt sich, welche Mahlzeiten schon eingekauft sind, auch nach dem Verschieben und nach dem Leeren der Liste. Sie stehen abgewählt unter **Schon eingekauft** und lassen sich mit **Nicht gekauft** zurückholen.
  - Einzelne Zutaten abwählen („haben wir“), **Immer da** legt sie in den Vorrat, dann werden sie nie mehr vorausgewählt. Salz, Pfeffer und Wasser werden nie vorgeschlagen.
  - **N auf die Liste** übernimmt die Auswahl, danach bietet Vommeal **An Keep senden** an.
- **Keep:** gleicht mit der Home-Assistant-Todo-Liste ab (siehe [Einkaufsliste und Home Assistant](#einkaufsliste-und-home-assistant)).
- Im Menü **⋯**: **Heute-Zutaten**, **Liste kopieren** (als Text zum Teilen) und **Vorrat verwalten**. Löschen und „Erledigte entfernen“ lassen sich rückgängig machen, „Alles löschen“ fragt nach.
- **Ohne Netz (z. B. im Supermarkt-Keller):** Das Handy merkt sich die zuletzt geladene Liste und zeigt sie mit „Offline · Stand 14:05“. Abhaken, Eintragen und Entfernen gehen weiter; die Änderungen warten auf dem Handy („2 Änderungen warten“) und werden gesendet, sobald wieder Verbindung da ist. Konnte die Liste nie geladen werden, zeigt Vommeal einen Fehler mit **Erneut laden** statt einer leeren Liste.
- **App ohne Netz öffnen:** Die installierte App startet auch offline (Service Worker). Das klappt nur, wenn Vommeal über https erreichbar ist (z. B. per Tailscale mit HTTPS); über einfaches http im Heimnetz funktioniert alles, aber nur mit Verbindung.

### Einstellungen und Nutzung

Profile, Mealie, Einkaufsreihenfolge, Home Assistant, [Benachrichtigungen](#benachrichtigungen), [Home Assistant Dashboard](#home-assistant-dashboard), **Nutzung (30 Tage)** und **Über & Docker** (Backup-Download). Die Nutzungsübersicht zählt lokal, welche Funktionen wie oft verwendet werden (z. B. ob Swipen genutzt wird); nichts davon verlässt den Server.

---

## Voraussetzungen

- **Ein Rechner, der dauerhaft läuft, mit Docker**, z. B. ein Synology-NAS mit Portainer oder Container Manager, ein Raspberry Pi oder ein Linux-Server.
- **Mealie** (empfohlen): Selbst gehostete Rezeptverwaltung. Vommeal holt die Rezepte von dort und legt neue Rezepte dort an. Ohne Mealie legt Vommeal Rezepte nur lokal an; Import per Link, Abgleich und Bewertungen in Mealie fallen weg.
- **Home Assistant** (optional): Für den Abgleich der Einkaufsliste mit einer HA-Todo-Liste (z. B. Google Keep), für persönliche Push-Erinnerungen mit Knöpfen über die HA-App auf den Handys und für den Wochenplan im Dashboard.
- **Tailscale** (optional): Für den Zugriff von unterwegs. Vommeal hat kein Login und gehört nicht offen ins Internet (siehe [Zugriff von unterwegs](#zugriff-von-unterwegs)).

---

## Installation

### Synology mit Portainer

Docker und Portainer müssen auf dem NAS schon laufen.

**1. Datenordner anlegen.** Per SSH auf dem NAS den Ordner für die Datenbank anlegen:

```bash
mkdir -p /volume1/docker/vommeal/data
```

`git` muss auf dem NAS nicht installiert sein, Portainer holt den Code selbst.

**2. Stack anlegen.** Portainer → **Stacks** → **Add stack** → **Repository**:

- **Repository URL:** `https://github.com/killlian24/vommeal` (oder die URL eures Forks)
- **Compose path:** `docker-compose.yml`
- **Environment variables:** mindestens `TZ=Europe/Berlin` (Standard ist `Europe/Copenhagen`), weitere Variablen siehe unten.

**3. Deployen.** Der erste Build dauert 3–5 Minuten (Node-Pakete und Next.js kompilieren). Danach ist Vommeal unter `http://<nas-ip>:3333` erreichbar.

### Beliebiger Docker-Rechner (ohne Portainer)

```bash
git clone https://github.com/killlian24/vommeal.git
cd vommeal
DATA_PATH=./data TZ=Europe/Berlin docker compose up -d --build
```

Die Variablen lassen sich auch in eine `.env`-Datei neben der `docker-compose.yml` schreiben, dann reicht `docker compose up -d --build`.

### Variablen der `docker-compose.yml`

| Variable | Standard | Zweck |
| --- | --- | --- |
| `DATA_PATH` | `/volume1/docker/vommeal/data` | Ordner auf dem Host für Datenbank, Backups und Bild-Cache. Auf Nicht-Synology-Systemen anpassen, z. B. `./data`. |
| `TZ` | `Europe/Copenhagen` | Zeitzone des Containers (Backup-Dateinamen, Logs). |
| `MEALIE_URL`, `MEALIE_TOKEN` | leer | Mealie-Zugang, alternativ in den Einstellungen der App. |
| `HA_URL`, `HA_TOKEN`, `HA_ENTITY` | leer | Home-Assistant-Zugang, alternativ in den Einstellungen der App. |
| `APP_PASSWORD` | leer | Optionales Passwort für Einstellungen und Backup-Download. |

Port `3333` und das Docker-Netz `172.26.0.0/24` stehen fest in der `docker-compose.yml`. Kollidiert das Netz mit einem vorhandenen, dort ein anderes freies /24 eintragen.

---

## Einrichtung in der App

`http://<nas-ip>:3333/settings` öffnen:

- **Profile:** eure beiden Namen. Welche Person ein Gerät benutzt, merkt sich jedes Handy selbst; darüber steht „Dieses Handy gehört: …“ mit **Ändern** und der Tipp zum Lesezeichen auf `/#name`.
- **Mealie-URL und API-Token:** für den Rezept-Sync. Den Token erstellt man in Mealie unter Profil → API Tokens.
- **Home Assistant:** URL, Long-Lived Access Token und Todo-Entität der Einkaufsliste (z. B. `todo.einkaufsliste`)
- **Abendessen-Kategorie:** Mealie-Kategorie, auf die die Rezepte gefiltert werden (z. B. `Abendessen`). In Vommeal angelegte oder per Link importierte Rezepte bekommen diese Kategorie automatisch, sonst würde der nächste Abgleich sie wieder entfernen.
- **Benachrichtigungen:** Geräte, Person pro Handy, Uhrzeiten, eigene Texte, App-Adresse und Zeitzone (siehe unten)
- **Home Assistant Dashboard:** Wochenplan-Sensoren und Kalender (siehe unten)

Auf dem Handy Vommeal im Browser öffnen und **„Zum Startbildschirm hinzufügen“** wählen, dann läuft es wie eine App.

### Zugangsdaten: in der App oder in Portainer

Am einfachsten trägt man Mealie und Home Assistant direkt in den Einstellungen ein. Die Tokens landen dann in der SQLite-Datenbank.

Sauberer ist es, sie in Portainer unter **Environment variables** des Stacks zu setzen. In der Tabelle steht der Variablenname ohne Leerzeichen als **name**, der Wert als **value**:

```text
MEALIE_URL=http://eure-mealie-adresse:9000
MEALIE_TOKEN=euer-mealie-token
HA_URL=http://eure-home-assistant-adresse:8123
HA_TOKEN=euer-long-lived-token
HA_ENTITY=todo.eure_einkaufsliste
APP_PASSWORD=optionales-passwort
```

So ist es falsch (keine YAML-Listenpunkte, keine Leerzeichen im Namen):

```text
- MEALIE_URL=http://eure-mealie-adresse:9000
Home Assistant Token=euer-token
HA TOKEN=euer-token
```

Als Adressen die verwenden, die das NAS bzw. der Container erreicht, meist LAN-Adressen wie `http://192.168.x.x:8123`. `localhost` funktioniert nur, wenn der Dienst im selben Container läuft.

Sind die Werte in Portainer gesetzt, gelten sie als von Docker gesteuert: Die Einstellungen zeigen sie an, die Felder sind aber gesperrt und werden nur in Portainer geändert.

`APP_PASSWORD` schützt sensible Aktionen wie das Ändern der Einstellungen und den Backup-Download. Ist es gesetzt, fragt Vommeal beim ersten geschützten Schritt danach.

### Einkaufsliste und Home Assistant

Home Assistant ist die Schnell-Erfassung: Unterwegs Einträge dort hinzufügen (z. B. per Sprachassistent oder Google Keep), dann in Vommeal unter **Einkauf** auf **Keep** tippen.

Der Sync holt zuerst die offenen HA-Einträge, verknüpft bekannte über ihre HA-UID, übernimmt neue, ordnet sie Kategorien zu, schickt fehlende Vommeal-Einträge an HA und **schreibt die HA-Liste danach komplett neu** in Kategorie-Reihenfolge. Das Neuschreiben ist nötig, weil HA-Todo-Listen nicht bei jeder Integration eine zuverlässige Sortierfunktion anbieten. Deshalb die echte Liste erst eintragen, wenn der Rest läuft.

UIDs und ein kleines Sync-Protokoll liegen in SQLite, wiederholte Syncs erzeugen also keine Duplikate, solange Einträge über UID oder exakt gleichen Text zugeordnet werden können.

Einträge, die Vommeal keiner Kategorie zuordnen kann, landen unter **Sonstiges**. Kategorie in Vommeal ändern und erneut synchronisieren. Jeder Abgleich prüft offene Einträge unter „Sonstiges“ erneut, verbesserte Kategorie-Regeln wirken also auch auf bestehende Einträge.

### Rezeptbilder

Bilder laufen über Vommeal (`/api/images/<id>`), nicht direkt über Mealie. Der Server lädt jedes Bild einmal, speichert es in `<DATA_PATH>/cache/images/` und liefert es von dort aus. Deshalb erscheinen Bilder auch unterwegs über Tailscale, wenn Mealie selbst nicht erreichbar ist. Ersetzt ihr ein Bild in Mealie, bekommt es eine neue Kennung; nach dem nächsten Abgleich zeigt Vommeal das neue Bild. Der Cache-Ordner kann jederzeit gelöscht werden.

### Nächtlicher Mealie-Sync

Jede Nacht um 03:30 (Zeitzone aus den Einstellungen) gleicht Vommeal die Rezepte mit Mealie ab, genau wie der Abgleich-Knopf auf der Seite **Rezepte**: neue und geänderte Rezepte werden übernommen, in Mealie gelöschte entfernt (mit Sicherheitsbremse, siehe [Rezepte](#rezepte)). Abschalten unter **Einstellungen → Mealie**. Eigene Markierungen in Vommeal („Schnell“ / „Aufwändig“) bleiben erhalten.

---

## Benachrichtigungen

Vommeal schickt Erinnerungen als Push-Nachricht über Home Assistant, genauer über die **Home Assistant Companion App** auf den Handys:

1. **HA-App installieren:** Auf beiden Handys die Home Assistant App installieren (iPhone: App Store, Android: Play Store), mit eurem Home Assistant verbinden und Benachrichtigungen erlauben. Jedes Handy erscheint danach in HA als Dienst `notify.mobile_app_<gerätename>`.
2. **Geräte auswählen:** In Vommeal unter **Einstellungen → Benachrichtigungen** die Geräte ankreuzen, die Nachrichten bekommen sollen.
3. **Person pro Handy:** Jedem Gerät eine Person zuordnen (z. B. iPhone → Kilian, Android → Susi). Die Nachricht nennt dann den Namen („Susi, heute gibt es …“), und ein Tipp auf einen Knopf wird dieser Person zugeschrieben. Geräte ohne Person bekommen denselben Text ohne Namen.
4. **App-Adresse eintragen:** Unter **App-Adresse** genau die Adresse eintragen, mit der ihr Vommeal öffnet, also die Tailscale- oder LAN-Adresse (z. B. `http://nas.tailXXXX.ts.net:3333` oder `http://192.168.0.10:3333`). Ein Tipp auf die Nachricht öffnet dann direkt die passende Seite. Ohne Adresse kommen die Nachrichten trotzdem, nur ohne Link und ohne die Knöpfe „Andere Ideen“ / „Selbst planen“.
5. **Testen:** **Testnachricht senden** schickt ein Beispiel mit echten Knöpfen. Die Test-Knöpfe ändern nichts, sie antworten nur mit „✓ Der Knopf funktioniert“. Kommt diese Antwort, ist alles eingerichtet.

### Erinnerungen und Knöpfe

- **Heute** (Standard: aus, 16:00)
  - Ist etwas geplant: „Susi, heute gibt es Butter Chicken 🍽️“ – ohne Knöpfe.
  - Ist nichts geplant: Vommeal schlägt ein Rezept vor (dieselben Regeln wie die Seite „Heute“: nichts mit „nicht nochmal“, nichts aus den letzten 21 Tagen oder schon für die nächsten Tage geplant, gut bewertete zuerst, Mo–Do bevorzugt schnelle Rezepte). Knöpfe:
    - **„<Rezept> kochen“** plant das Rezept für heute,
    - **„Reste“** trägt „Reste“ für heute ein,
    - **„Andere Ideen“** öffnet die Seite „Heute“ mit weiteren Vorschlägen.
- **Wochenplanung** (Standard: sonntags 18:00): „Nächste Woche sind noch 5 Abende frei – kurz planen?“ – nur wenn in der nächsten Woche (Mo–So) noch Abende leer sind. Knöpfe:
  - **„Woche füllen“** füllt die leeren Abende automatisch (wie „freie Abende füllen“ in der Woche),
  - **„Selbst planen“** öffnet die nächste Woche im Planer.

Nach einem Tipp ersetzt Vommeal die Nachricht auf diesem Handy durch eine Bestätigung („✓ Butter Chicken ist für heute geplant“, „✓ 5 Abende gefüllt“). Das andere Handy bekommt eine kurze Info („Kilian hat Butter Chicken für heute geplant“), die dort die alte Nachricht mit den Knöpfen ersetzt. Ein schon geplanter Abend wird nie überschrieben: Wer zu spät tippt, bekommt „Heute ist schon … geplant“. Doppelte Tipps schaden nicht.

Android zeigt höchstens drei Knöpfe, iOS kürzt lange Titel; lange Rezeptnamen werden deshalb gekürzt. Auf dem iPhone erscheinen die Knöpfe nach langem Drücken bzw. Herunterziehen der Nachricht.

### Eigene Texte

Unter **Einstellungen → Benachrichtigungen** lassen sich die drei Texte anpassen (höchstens 200 Zeichen, leer = Standardtext). Platzhalter:

| Platzhalter | Bedeutung | Verfügbar in |
| --- | --- | --- |
| `{name}` | Person des Handys | allen Texten |
| `{gericht}` | geplantes Gericht | „Heute – etwas geplant“ |
| `{vorschlag}` | vorgeschlagenes Rezept | „Heute – nichts geplant“ |
| `{anzahl}` | Anzahl freier Abende | „Wochenplanung“ |

Hat ein Handy keine Person, fällt `{name}` samt folgendem Komma oder Doppelpunkt weg. Gibt es keinen Vorschlag (z. B. keine Rezepte), entfällt der Satz mit `{vorschlag}`.

### Keine HA-Automation nötig

Vommeal hört selbst auf die Knöpfe: Der Server hält eine Verbindung zur WebSocket-API von Home Assistant offen (mit demselben Token wie für die Einkaufsliste) und reagiert auf das Ereignis `mobile_app_notification_action`. In Home Assistant muss dafür nichts eingerichtet werden. Die Verbindung wird nach Abbrüchen automatisch neu aufgebaut; im Container-Log stehen Zeilen wie `[ha-events] connected to …`. Lehnt Home Assistant den Token ab, versucht Vommeal es nicht weiter (sonst könnte HA das NAS sperren), bis die HA-Einstellungen erneut gespeichert werden. Änderungen an HA-Adresse, Token oder Geräteliste in den Einstellungen gelten sofort; stehen Adresse oder Token als Docker-Variablen in Portainer, braucht eine Änderung dort wie immer einen Neustart des Containers.

Tag, Uhrzeit und Zeitzone (Standard `Europe/Copenhagen`) lassen sich in den Einstellungen ändern. Jede Erinnerung wird höchstens einmal pro Tag verschickt. Planer und Knopf-Empfang laufen nur im Docker-Container (Produktion), nicht im lokalen Dev-Server (siehe `VOMMEAL_SCHEDULER` in `.env.example`).

---

## Home Assistant Dashboard

Vommeal zeigt den Wochenplan in Home Assistant an, ohne dass dort etwas eingerichtet werden muss. Voraussetzung sind nur HA-Adresse und Token (**Einstellungen → Home Assistant**); die To-do-Liste wird dafür nicht gebraucht. Ein- und ausschalten unter **Einstellungen → Home Assistant Dashboard → Wochenplan an Home Assistant senden** (Standard: an).

### Sensoren

Vommeal schreibt drei Entitäten über die REST-API von Home Assistant (`POST /api/states/<entity_id>`):

| Entität | Zustand | Wichtige Attribute |
| --- | --- | --- |
| `sensor.vommeal_heute` | Gericht heute, sonst „Nichts geplant“ | `datum`, `wochentag`, `geplant_von`, `rezept_url`, `entity_picture` (Rezeptfoto) |
| `sensor.vommeal_morgen` | Gericht morgen, sonst „Nichts geplant“ | wie oben |
| `sensor.vommeal_woche` | geplante Abende dieser Woche, z. B. `5/7` | `frei` (freie Abende bis Sonntag), `tage` und `naechste_woche` (je Mo–So: `datum`, `tag`, `gericht`, `von`, `bild`, `heute`, `vorbei`), `markdown`, `markdown_naechste_woche` |

`markdown` ist ein fertiger Text für eine Markdown-Karte: eine Zeile pro Tag, heute mit 👉 und fett, vergangene Tage durchgestrichen, freie Abende als „—“, „Reste“, „Auswärts essen“ usw. mit ihrem Emoji. `rezept_url`, `entity_picture`, `bild` und die Links im Markdown gibt es nur, wenn unter **Benachrichtigungen → App-Adresse** eingetragen ist, wie ihr Vommeal öffnet. Die Bilder lädt das Handy bzw. der Browser direkt von Vommeal, das Gerät muss diese Adresse also erreichen (zu Hause oder über Tailscale). Wird Home Assistant über `https` geöffnet und Vommeal über `http`, blockiert der Browser die Bilder.

Wann gesendet wird: sobald sich der Plan ändert (nach ca. 2 Sekunden), beim Start des Containers und sonst alle 30 Minuten. Das regelmäßige Senden ist nötig, weil Home Assistant so angelegte Sensoren bei einem Neustart vergisst. **Jetzt senden** in den Einstellungen schickt sofort. Im Container-Log steht pro Übertragung eine Zeile `[ha-dashboard] sent 3 sensors (…)` bzw. `[ha-dashboard] push failed: …`. Nach dem Ausschalten bleiben die Sensoren bis zum nächsten HA-Neustart mit dem letzten Stand stehen.

### Karte fürs Dashboard

Dashboard → ✏️ Bearbeiten → Karte hinzufügen → ganz unten „Manuell“ → einfügen (der Text steht auch zum Kopieren in den Einstellungen):

```yaml
type: vertical-stack
cards:
  - type: tile
    entity: sensor.vommeal_heute
    name: Heute
    show_entity_picture: true
  - type: tile
    entity: sensor.vommeal_morgen
    name: Morgen
    show_entity_picture: true
  - type: markdown
    title: Diese Woche
    content: "{{ state_attr('sensor.vommeal_woche', 'markdown') or 'Noch keine Daten von Vommeal' }}"
```

Die Kacheln (`tile`) zeigen das Rezeptfoto als rundes Bild und fallen ohne Foto auf das Besteck-Symbol zurück. Eine `picture-entity`-Karte wäre an Abenden ohne Foto (Reste, Auswärts essen, Rezepte ohne Bild) nur eine leere Fläche. Wer trotzdem ein großes Foto möchte, kann eine zusätzliche Karte `type: picture-entity` mit `entity: sensor.vommeal_heute` ergänzen. Für die nächste Woche eine zweite Markdown-Karte mit `markdown_naechste_woche` anlegen.

### Kalender

Unter `/api/calendar.ics` gibt es alle geplanten Abende als Kalender-Abo (iCalendar): ein ganztägiger Termin pro Abend, 14 Tage zurück und 42 Tage voraus, mit „Geplant von …“ und dem Rezept-Link (wenn die App-Adresse eingetragen ist). Die fertige Adresse steht unter **Einstellungen → Home Assistant Dashboard → Kalender**, z. B. `http://nas.tailXXXX.ts.net:3333/api/calendar.ics`.

- **Home Assistant:** Einstellungen → Geräte & Dienste → Integration hinzufügen → **Remote Calendar** → diese Adresse einfügen. Danach gibt es eine Kalender-Entität, die auch im Kalender-Dashboard erscheint.
- **iPhone:** Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → **Kalenderabo hinzufügen** → diese Adresse einfügen.

Das Gerät bzw. Home Assistant muss die Adresse erreichen: zu Hause im WLAN oder unterwegs über Tailscale. Kalender-Apps holen das Abo in eigenen Abständen (Vommeal empfiehlt stündlich); Änderungen erscheinen dort also nicht sofort.

---

## Rezept per Link importieren

Vommeal lässt Mealie die Rezeptseite auslesen, legt das Rezept in Mealie an und übernimmt es sofort in Vommeal (Mealie muss dafür eingerichtet sein).

- **Android:** Vommeal als App installieren („Zum Startbildschirm hinzufügen“ in Chrome). Danach im Browser oder in einer anderen App auf **Teilen** tippen und **Vommeal** wählen.
- **iPhone:** iOS bietet Web-Apps nicht im Teilen-Menü an. Link kopieren, in Vommeal die Seite **Rezepte** öffnen und den Link dort in das Import-Feld einfügen.

Klappt der Import nicht, erkennt Mealie auf der Seite kein Rezept; dann das Rezept in Mealie von Hand anlegen und synchronisieren.

---

## Updates

In Portainer den Stack aus dem Repository neu deployen (**Pull and redeploy**). Ohne Portainer:

```bash
git pull
docker compose up -d --build
```

Die Datenbank im Datenordner wird bei Updates nie angefasst.

---

## Zugriff von unterwegs

**Tailscale** auf dem NAS und den Handys installieren und Vommeal über die Tailnet-IP oder den MagicDNS-Namen des NAS öffnen. Am Router müssen keine Ports geöffnet werden.

Vommeal **nicht** per Portweiterleitung am Router freigeben und auch nicht über Tailscale Funnel, solange keine eigene Authentifizierung davor sitzt. Vommeal ist für vertrauenswürdige Zugriffe im Heimnetz oder per Tailscale gedacht.

---

## Backup

**Einstellungen** → **Über & Docker** → **Datenbank-Backup herunterladen** erzeugt ein konsistentes SQLite-Backup.

Die Datenbank liegt im Datenordner (`/volume1/docker/vommeal/data/` bzw. `DATA_PATH`). Weil SQLite im WAL-Modus läuft, gehören zu einer manuellen Dateisicherung `vommeal.db`, `vommeal.db-wal` und `vommeal.db-shm`, falls vorhanden.

### Automatische tägliche Backups

- **Wo:** `<DATA_PATH>/backups/vommeal-JJJJ-MM-TT.db`
- **Wann:** etwa 30 Sekunden nach dem Containerstart, danach alle 24 Stunden (eigener Timer, unabhängig von den Erinnerungen). Pro Kalendertag entsteht höchstens eine Datei; existiert sie schon, wird der Lauf übersprungen.
- **Aufbewahrung:** Dateien älter als 14 Tage werden bei jedem Lauf gelöscht. Wer sie länger behalten will, kopiert sie woanders hin (Hyper Backup, anderer Ordner, …).
- **Wie:** über die Online-Backup-API von SQLite, also konsistent auch bei laufender App und ohne `-wal`/`-shm`-Dateien. Im Container-Log erscheinen Zeilen wie `[backup] created: ...`.

### Wiederherstellen

1. Container in Portainer stoppen.
2. Im Datenordner (File Station oder SSH) die aktuelle `vommeal.db` umbenennen, eventuelle `vommeal.db-wal` / `vommeal.db-shm` löschen und das Backup an ihre Stelle kopieren:

   ```bash
   cd /volume1/docker/vommeal/data
   mv vommeal.db vommeal.db.broken
   rm -f vommeal.db-wal vommeal.db-shm
   cp backups/vommeal-2026-01-31.db vommeal.db
   ```

   Ein über die Einstellungen heruntergeladenes Backup funktioniert genauso.

3. Container wieder starten. Das Entrypoint-Skript korrigiert die Dateirechte, eine mit dem eigenen Benutzer kopierte Datei funktioniert also.

Datenbank und Backups vertraulich behandeln: Sie können Mealie- und Home-Assistant-Tokens sowie eure Essensplanung enthalten.

---

## Fehlerbehebung

**App lädt endlos oder Einstellungen werden nicht gespeichert:** Meist kann der Container nicht in den Datenordner schreiben. Das Image korrigiert die Rechte von `/app/data` beim Start, also zuerst den aktuellen Stand neu deployen. Hilft das nicht, prüfen, ob der Ordner existiert:

```bash
mkdir -p /volume1/docker/vommeal/data
```

und den Stack erneut deployen.

**Mealie- oder HA-Felder erscheinen nicht als von Docker gesteuert:** Die Variablen kommen nicht im Container an. In Portainer entweder leer lassen und in den Einstellungen konfigurieren oder in der Tabelle **Environment variables** mit exakten Namen wie `MEALIE_URL` und `HA_TOKEN` eintragen.

**Mealie oder Home Assistant nicht erreichbar, obwohl die Adresse stimmt:** Meist liegt es am Docker-Netz. Ist Dockers Vorrat an 172er-Netzen aufgebraucht, weicht Docker auf ein 192.168er-Netz aus, das die Synology-Firewall nicht aus dem Container lässt. Deshalb steht in der `docker-compose.yml` fest `172.26.0.0/24`. Kollidiert das mit einem vorhandenen Netz, dort ein anderes freies /24 eintragen; verwaiste Netze entfernt `sudo docker network prune`. „Test connection“ in den Einstellungen zeigt den genauen Grund (z. B. Zeitüberschreitung oder Verbindung abgelehnt).

**Portainer: „authentication required: Invalid username or token“ beim Deployen:** Das Repository ist öffentlich, Portainer braucht keine Zugangsdaten. Beim Stack **Authentication** ausschalten. Lässt sich das beim bestehenden Stack nicht ändern, den Stack löschen (Daten im Datenordner bleiben erhalten) und neu anlegen.

**Benachrichtigungen kommen ohne Knöpfe an oder ein Tipp auf einen Knopf bewirkt nichts:** Im Container-Log nach Zeilen mit `[ha-events]` suchen. `connected` bedeutet, dass Vommeal auf die Knöpfe hört. Fehlen die Knöpfe „Andere Ideen“ / „Selbst planen“, ist die App-Adresse nicht eingetragen.

**Ein neues Rezeptbild erscheint nicht:** Auf der Seite **Rezepte** einmal abgleichen. Danach bekommt das Bild eine neue Adresse und wird neu geladen.


---

## Lokale Entwicklung

```bash
cp .env.example .env.local   # danach anpassen
npm install
npm run dev                  # http://localhost:3000
```

Nützliche Skripte: `npm run typecheck`, `npm run lint`, `npm test`.

**Einen lokalen Dev-Server nicht mit dem echten Home Assistant verbinden.** Der Einkaufslisten-Sync schreibt die echte Liste neu (alle Einträge werden entfernt und sortiert neu angelegt), ein lokaler Lauf mit echten Zugangsdaten verändert also die Liste, die der Haushalt gerade benutzt. `.env.example` enthält deshalb

```text
HA_URL=http://127.0.0.1:9
```

eine absichtlich tote Adresse: Jeder HA-Aufruf schlägt sofort fehl, nichts wird verändert. Nur durch die echte URL ersetzen, wenn lokale Läufe wirklich synchronisieren sollen. Dasselbe gilt für Werte auf der lokalen Einstellungsseite: Sie landen in der lokalen `data/vommeal.db`, also dort die HA-Felder ebenfalls leer lassen.

`MEALIE_*` kann leer bleiben; der Rezept-Sync ist dann nicht verfügbar und Rezepte werden von Hand angelegt. Die lokale Datenbank (`./data`, von git ignoriert) bekommt ebenfalls die täglichen Backups.
