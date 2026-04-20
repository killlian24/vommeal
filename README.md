# Vommeal

Meal planning PWA for two. Weekly planner, Mealie recipe sync, HA shopping list integration, fun voting mode.

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
```

Use addresses that the NAS/container can reach, usually LAN addresses such as `http://192.168.x.x:8123`. Do not use `localhost` unless the service runs inside the same container.

When these values are set in Portainer, Vommeal treats them as Docker-controlled. The Settings page will show the active values, but those fields are disabled and must be changed in Portainer.

If you leave these variables empty, Vommeal Settings stays editable. That is simpler, but stores the tokens in the SQLite database.

---

## First-run setup

Open `http://<nas-ip>:3333` → **Settings**:

- **User names** — yours and your partner's (remembered per browser via localStorage)
- **Mealie URL + API token** — for recipe sync, unless set in Portainer
- **Home Assistant URL + token + todo entity** — for shopping list sync with Google Keep, unless set in Portainer
- **Dinner category** — Mealie category to filter recipes (e.g. `Abendessen`)

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

Everything lives in `/volume1/docker/vommeal/data/vommeal.db`. Back that file up and you can restore the full app state.

Treat the database backup as private: it may contain Mealie/Home Assistant tokens and meal-planning data.
