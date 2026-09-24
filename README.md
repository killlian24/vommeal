# Vommeal

Meal planning PWA for two. Weekly planner, Mealie recipe sync, HA shopping list integration, push reminders via Home Assistant, recipe import by link, fun voting mode.

---

## Install on Synology via Portainer

Assumes Docker + Portainer are already running on your NAS.

### 1. Create the data folder

SSH into your NAS and create the folder where Vommeal stores its database:

```bash
mkdir -p /volume1/docker/vommeal/data
```

You do not need `git` installed on the NAS when deploying through Portainer's repository mode.

### 2. Deploy in Portainer

Portainer → **Stacks** → **Add stack** → choose **Repository**:

- **Repository URL:** `https://github.com/killlian24/vommeal`
- **Compose path:** `docker-compose.yml`

The compose file already stores the database in the Synology folder:

```yaml
services:
  vommeal:
    build: .
    container_name: vommeal
    restart: unless-stopped
    ports:
      - "3333:3000"
    volumes:
      - /volume1/docker/vommeal/data:/app/data
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
      - TZ=${TZ:-Europe/Copenhagen}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

First build takes 3–5 minutes (Node deps + Next.js compile). The container is healthy when `http://<nas-ip>:3333` loads.

---

## Mealie and Home Assistant setup

Easiest: deploy Vommeal first, open `http://<nas-ip>:3333/settings`, and enter the Mealie and Home Assistant values in the app.

Cleaner Docker option: set them in Portainer's **Environment variables** section for the stack. The included compose file already passes these variables into the container.

In Portainer's environment-variable table, use the variable name without spaces as the **name**, and put the token or URL as the **value**:

```text
MEALIE_URL=http://your-mealie-address:9000
MEALIE_TOKEN=your-mealie-api-token
HA_URL=http://your-home-assistant-address:8123
HA_TOKEN=your-home-assistant-long-lived-token
HA_ENTITY=todo.your_shopping_list_entity
APP_PASSWORD=optional-admin-password
```

Do not paste YAML list items into Portainer's environment-variable table. These are wrong there:

```text
- MEALIE_URL=http://your-mealie-address:9000
Home Assistant Token=your-token
HA TOKEN=your-token
```

The compose file maps the Portainer variables like this:

```yaml
environment:
  - NODE_ENV=production
  - DATA_DIR=/app/data
  - MEALIE_URL=${MEALIE_URL:-}
  - MEALIE_TOKEN=${MEALIE_TOKEN:-}
  - HA_URL=${HA_URL:-}
  - HA_TOKEN=${HA_TOKEN:-}
  - HA_ENTITY=${HA_ENTITY:-}
  - APP_PASSWORD=${APP_PASSWORD:-}
```

Use addresses that the NAS/container can reach, usually LAN addresses such as `http://192.168.x.x:8123`. Do not use `localhost` unless the service runs inside the same container.

When these values are set in Portainer, Vommeal treats them as Docker-controlled. The Settings page will show the active values, but those fields are disabled and must be changed in Portainer.

If you leave these variables empty, Vommeal Settings stays editable. That is simpler, but stores the tokens in the SQLite database.

Optional: set `APP_PASSWORD` to protect sensitive actions such as changing Settings and downloading a database backup. When it is set, Vommeal asks for the password the first time a protected action is used.

### Home Assistant sync behavior

Home Assistant is treated as the quick-capture list. Add items there during the day, then press **Sync** in Vommeal.

Sync pulls the active Home Assistant todo items first, links known items by HA UID, imports new HA-only items into Vommeal, categorizes them, sends missing Vommeal items to HA, and then rewrites the active HA list in category order. The rewrite is necessary because Home Assistant todo lists do not expose a reliable move/reorder API for every todo integration.

The sync stores HA UIDs and a small sync log in SQLite so repeated syncs should be idempotent and should not create duplicates when items can be matched by UID or by their exact displayed text.

Items that Vommeal cannot confidently categorize stay in **Other** and are marked internally as needing a category. Change the category in Vommeal and sync again.

### Recipe images

Recipe images are loaded through Vommeal (`/api/images/<id>`), not directly from Mealie. The server fetches each image once, caches it for 7 days in `/volume1/docker/vommeal/data/cache/images/`, and serves it from there. That is why pictures also show up when you open Vommeal over Tailscale away from home, where Mealie itself is not reachable. The cache folder can be deleted at any time.

### Nightly Mealie sync

Every night at 03:30 (time zone from Settings) Vommeal pulls all recipes from Mealie, the same as pressing **Sync** in Settings. Turn it off in Settings if you prefer syncing by hand. Your own marks in Vommeal (e.g. "schnell" / "aufwendig") are kept; Mealie does not overwrite them.

---

## Benachrichtigungen

Vommeal schickt Erinnerungen als Push-Nachricht über Home Assistant, genauer über die **Home Assistant Companion App** auf den Handys:

1. **HA-App installieren:** Auf beiden Handys die Home Assistant App installieren (iPhone: App Store, Android: Play Store), mit eurem Home Assistant verbinden und Benachrichtigungen erlauben. Jedes Handy erscheint danach in HA als Dienst `notify.mobile_app_<gerätename>`.
2. **Geräte auswählen:** In Vommeal unter **Einstellungen → Benachrichtigungen** die Geräte ankreuzen, die Nachrichten bekommen sollen, und mit **Testnachricht senden** prüfen.
3. **App-Adresse eintragen:** Unter **App-Adresse** genau die Adresse eintragen, mit der ihr Vommeal öffnet, also die Tailscale- oder LAN-Adresse (z. B. `http://nas.tailXXXX.ts.net:3333` oder `http://192.168.0.10:3333`). Ein Tipp auf die Nachricht öffnet dann direkt die passende Seite. Ohne Adresse kommen die Nachrichten trotzdem, nur ohne Link.

Erinnerungen:

- **Wochenplanung** (Standard: sonntags 18:00): „Nächste Woche sind noch N Abende frei – kurz planen?“ – nur wenn in der nächsten Woche (Mo–So) noch Abende leer sind. Öffnet die nächste Woche im Planer.
- **Heute** (Standard: aus, 16:00): „Heute: <Gericht>“ bzw. „Heute ist noch nichts geplant“. Öffnet `/tonight`.

Tag, Uhrzeit und Zeitzone (Standard `Europe/Copenhagen`) lassen sich in den Einstellungen ändern. Jede Erinnerung wird höchstens einmal pro Tag verschickt. Der Planer läuft nur im Docker-Container (Produktion), nicht im lokalen Dev-Server (siehe `VOMMEAL_SCHEDULER` in `.env.example`).

---

## Rezept per Link importieren

Vommeal lässt Mealie die Rezeptseite auslesen, legt das Rezept in Mealie an und übernimmt es sofort in Vommeal (Mealie muss dafür eingerichtet sein).

- **Android:** Vommeal als App installieren („Zum Startbildschirm hinzufügen“ in Chrome). Danach im Browser oder in einer anderen App auf **Teilen** tippen und **Vommeal** wählen.
- **iPhone:** iOS bietet Web-Apps nicht im Teilen-Menü an. Link kopieren, in Vommeal die Seite **Rezepte** öffnen und den Link dort in das Import-Feld einfügen.

Klappt der Import nicht, erkennt Mealie auf der Seite kein Rezept; dann das Rezept in Mealie von Hand anlegen und synchronisieren.

---

## Troubleshooting

If the app keeps loading or Settings values do not save, the container probably cannot write to the SQLite database folder. The Docker image fixes `/app/data` ownership on startup, so redeploy the latest stack from GitHub first.

If it still cannot save, check that this folder exists on the NAS:

```bash
mkdir -p /volume1/docker/vommeal/data
```

Then redeploy the stack in Portainer.

If Mealie or Home Assistant fields do not show as Docker-controlled, the variables are not reaching the container. In Portainer, either leave them empty and configure Vommeal in **Settings**, or add them in the stack **Environment variables** table using exact names like `MEALIE_URL` and `HA_TOKEN`.

---

## First-run setup

Open `http://<nas-ip>:3333` → **Settings**:

- **User names** — yours and your partner's (remembered per browser via localStorage)
- **Mealie URL + API token** — for recipe sync, unless set in Portainer
- **Home Assistant URL + token + todo entity** — for shopping list sync with Google Keep, unless set in Portainer
- **Dinner category** — Mealie category to filter recipes (e.g. `Abendessen`)
- **Benachrichtigungen** — devices, reminder times, app address and time zone (see above)

---

## Updating

In Portainer, redeploy the stack from the repository and enable pulling the latest image/source if Portainer asks.

Your database in `/volume1/docker/vommeal/data/` is never touched by updates.

---

## Access outside home

Use **Tailscale** — install it on the NAS and your devices, then access Vommeal via the NAS tailnet IP or MagicDNS name. No router ports need to be opened.

Do **not** port-forward Vommeal directly from your router, and do not use Tailscale Funnel for this app unless you add authentication first. Vommeal is intended for trusted LAN/Tailscale access.

---

## Backup

Use **Settings** → **About & Docker** → **Download database backup** for a safe SQLite backup.

The live database files live in `/volume1/docker/vommeal/data/`. Because SQLite uses WAL mode, manual file backups should include `vommeal.db`, `vommeal.db-wal`, and `vommeal.db-shm` when they exist.

### Automatic daily backups

Vommeal also backs itself up automatically:

- **Where:** `/volume1/docker/vommeal/data/backups/vommeal-YYYY-MM-DD.db` (`${DATA_DIR}/backups/` in general).
- **When:** about 30 seconds after the container starts and then every 24 hours (own timer, independent of the reminder scheduler). Only one file per calendar day is written; if today's file already exists the run is skipped.
- **Retention:** files older than 14 days are deleted on each run. Copy a file elsewhere (Hyper Backup, another share, ...) if you want to keep it longer.
- **How:** the copy is made with SQLite's online backup API, so it is consistent even while the app is running and does not need the `-wal`/`-shm` files. Check the container log for `[backup] created: ...` lines.

### Restore

1. Stop the container in Portainer.
2. In File Station (or over SSH) rename the current `vommeal.db` to keep it, delete any `vommeal.db-wal` / `vommeal.db-shm` files next to it, and copy the backup into place:

   ```bash
   cd /volume1/docker/vommeal/data
   mv vommeal.db vommeal.db.broken
   rm -f vommeal.db-wal vommeal.db-shm
   cp backups/vommeal-2026-01-31.db vommeal.db
   ```

   A file downloaded from **Settings** works the same way.

3. Start the container again. The entrypoint fixes file ownership, so a copy made by your own user works.

Treat the database and its backups as private: they may contain Mealie/Home Assistant tokens and meal-planning data.

---

## Local development

```bash
cp .env.example .env.local   # then edit it
npm install
npm run dev                  # http://localhost:3000
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`.

**Do not point a local dev server at your real Home Assistant.** The shopping-list sync rewrites the real Google Keep list (it removes and re-adds every item to sort it), so a local run with real credentials modifies the list your household is using. `.env.example` therefore ships with

```text
HA_URL=http://127.0.0.1:9
```

a deliberately dead address: every HA call fails fast and nothing is touched. Only replace it with the real URL when you actually want local runs to sync. The same applies to values entered on the local Settings page: those are stored in your local `data/vommeal.db`, so keep the HA fields empty there too.

`MEALIE_*` can be left empty; recipe sync is then simply unavailable and you can create recipes by hand. The local database (`./data`, ignored by git) also receives the daily backups described above.
