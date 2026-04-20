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

## First-run setup

Open `http://<nas-ip>:3333` → **Settings**:

- **User names** — yours and your partner's (remembered per browser via localStorage)
- **Mealie URL + API token** — for recipe sync
- **Home Assistant URL + token + todo entity** — for shopping list sync with Google Keep
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
