# Vommeal

Essensplaner als Web-App (PWA) für den Haushalt: Wochenplan, Rezepte aus Mealie, Einkaufsliste mit Home-Assistant-Abgleich, Erinnerungen per Push, Rezeptimport per Link und ein Fun-Modus zum gemeinsamen Abstimmen.

---

## Voraussetzungen

- **Ein Rechner, der dauerhaft läuft, mit Docker**, z. B. ein Synology-NAS mit Portainer oder Container Manager, ein Raspberry Pi oder ein Linux-Server.
- **Mealie** (empfohlen): Selbst gehostete Rezeptverwaltung, aus der Vommeal die Rezepte holt. Ohne Mealie lassen sich Rezepte nur von Hand in Vommeal anlegen, Rezeptimport per Link und Bewertungen in Mealie fallen weg.
- **Home Assistant** (optional): Für den Abgleich der Einkaufsliste mit einer HA-Todo-Liste (z. B. Google Keep) und für Push-Erinnerungen über die HA-App auf den Handys.
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

- **Namen:** eure beiden Namen (werden pro Browser gemerkt)
- **Mealie-URL und API-Token:** für den Rezept-Sync. Den Token erstellt man in Mealie unter Profil → API Tokens.
- **Home Assistant:** URL, Long-Lived Access Token und Todo-Entität der Einkaufsliste (z. B. `todo.einkaufsliste`)
- **Abendessen-Kategorie:** Mealie-Kategorie, auf die die Rezepte gefiltert werden (z. B. `Abendessen`)
- **Benachrichtigungen:** Geräte, Uhrzeiten, App-Adresse und Zeitzone (siehe unten)

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

Home Assistant ist die Schnell-Erfassung: Unterwegs Einträge dort hinzufügen (z. B. per Sprachassistent oder Google Keep), dann in Vommeal auf **Sync** tippen.

Der Sync holt zuerst die offenen HA-Einträge, verknüpft bekannte über ihre HA-UID, übernimmt neue, ordnet sie Kategorien zu, schickt fehlende Vommeal-Einträge an HA und **schreibt die HA-Liste danach komplett neu** in Kategorie-Reihenfolge. Das Neuschreiben ist nötig, weil HA-Todo-Listen nicht bei jeder Integration eine zuverlässige Sortierfunktion anbieten. Deshalb die echte Liste erst eintragen, wenn der Rest läuft.

UIDs und ein kleines Sync-Protokoll liegen in SQLite, wiederholte Syncs erzeugen also keine Duplikate, solange Einträge über UID oder exakt gleichen Text zugeordnet werden können.

Einträge, die Vommeal keiner Kategorie zuordnen kann, landen unter **Sonstiges**. Kategorie in Vommeal ändern und erneut synchronisieren.

### Rezeptbilder

Bilder laufen über Vommeal (`/api/images/<id>`), nicht direkt über Mealie. Der Server lädt jedes Bild einmal, speichert es 7 Tage in `<DATA_PATH>/cache/images/` und liefert es von dort aus. Deshalb erscheinen Bilder auch unterwegs über Tailscale, wenn Mealie selbst nicht erreichbar ist. Der Cache-Ordner kann jederzeit gelöscht werden.

### Nächtlicher Mealie-Sync

Jede Nacht um 03:30 (Zeitzone aus den Einstellungen) holt Vommeal alle Rezepte aus Mealie, genau wie **Sync** in den Einstellungen. Lässt sich dort abschalten. Eigene Markierungen in Vommeal (z. B. „schnell“ / „aufwendig“) bleiben erhalten.

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
  - **„Woche füllen“** füllt die leeren Abende automatisch (wie „Fast“ im Planer),
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

**Mealie oder Home Assistant nicht erreichbar, obwohl die Adresse stimmt:** Prüfen, ob das Docker-Netz (`172.26.0.0/24` in der `docker-compose.yml`) mit einem anderen Netz kollidiert, und dort ggf. ein anderes freies /24 eintragen.

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
