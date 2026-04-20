# Vommeal

Meal planning PWA for two. Weekly planner, Mealie recipe sync, HA shopping list integration, fun voting mode.

---

## Install on Synology via Portainer

Assumes Docker + Portainer are already running on your NAS.

### 1. Clone the repo on the NAS

SSH into your NAS and clone into your docker folder:

```bash
git clone https://github.com/killlian24/vommeal.git /volume1/docker/vommeal
mkdir -p /volume1/docker/vommeal/data
```

### 2. Adjust the compose file

Edit `/volume1/docker/vommeal/docker-compose.yml` — change the volume line to use a bind mount:

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

### 3. Deploy in Portainer

Portainer → **Stacks** → **Add stack** → choose **Repository**:

- **Repository URL:** `https://github.com/killlian24/vommeal`
- **Compose path:** `docker-compose.yml`

Or just SSH and run:

```bash
cd /volume1/docker/vommeal
docker compose up -d --build
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

```bash
cd /volume1/docker/vommeal
git pull
docker compose up -d --build
```

Your database in `data/` is never touched by updates.

---

## Access outside home

Use **Tailscale** — install on the NAS, access via the tailnet IP. No ports to open, no auth to add.

---

## Backup

Everything lives in `/volume1/docker/vommeal/data/vommeal.db`. Back that file up and you can restore the full app state.
