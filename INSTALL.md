# Installing Vommeal on Synology with Portainer

This guide walks through deploying Vommeal on a Synology NAS using Portainer. It assumes you already have Docker (Container Manager) and Portainer installed.

---

## 1. Create the folder structure on the NAS

Open **File Station** and navigate to your `docker` shared folder (create one if you don't have it). Inside, create:

```
docker/
└── vommeal/
    ├── source/      ← the app source code goes here
    └── data/        ← SQLite database + persistent data
```

You can create these via File Station (right-click → Create folder) or via SSH:

```bash
ssh admin@<nas-ip>
mkdir -p /volume1/docker/vommeal/source
mkdir -p /volume1/docker/vommeal/data
```

> Adjust `/volume1/` to whichever volume your `docker` folder lives on.

---

## 2. Copy the source code to the NAS

Copy the **entire Vommeal project folder** (everything — `app/`, `lib/`, `components/`, `public/`, `Dockerfile`, `package.json`, etc.) into `/volume1/docker/vommeal/source/`.

Easiest ways:

- **File Station** — drag-and-drop from your computer
- **SMB** — mount the `docker` share and copy files over
- **SSH + scp** from your Mac:
  ```bash
  scp -r /Users/kilianvomstein/Documents/Claude/Vommeal/* admin@<nas-ip>:/volume1/docker/vommeal/source/
  ```

> Do **not** copy `node_modules/`, `.next/`, or `data/` — these get rebuilt in the container. If they came along, delete them from the NAS to keep the image small.

When done, the structure should look like:

```
/volume1/docker/vommeal/
├── source/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── ... (all other project files)
└── data/        (empty for now)
```

---

## 3. Adjust the compose file for bind mounts

The default `docker-compose.yml` uses a named volume. For easier backups on Synology, switch it to a bind mount pointing at the `data/` folder you created.

Edit `/volume1/docker/vommeal/source/docker-compose.yml` so it looks like this:

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

Changes from the repo default:
- `volumes:` now points to the bind-mount path (not a named volume)
- The `volumes:` block at the bottom is removed
- Port `3333` is free on most Synology setups; change if it clashes

---

## 4. Deploy via Portainer

1. Open Portainer → **Stacks** → **Add stack**
2. **Name:** `vommeal`
3. **Build method:** choose **Upload** or **Web editor**, whichever you prefer. The cleanest option on Synology is:
   - Select **Web editor**
   - Paste the compose content from step 3
   - Scroll down to **Environment variables** — leave empty (configured via UI later)
4. Click **Deploy the stack**

Portainer will now build the image (takes 2–5 minutes on first run — it's installing Node deps and compiling Next.js) and start the container.

> If the build fails with "no such file or directory" errors, the build context is wrong. Portainer's web editor uses `/data/compose/<stack-id>/` as the build context, which won't contain your source. In that case, use the alternative method below.

### Alternative: deploy from a local compose file

If the web editor approach doesn't find your source, use this instead:

1. Portainer → **Stacks** → **Add stack**
2. **Build method:** select **Repository** → No, you want **Upload** or copy-paste.
3. The simplest reliable path: SSH into the NAS and run:
   ```bash
   cd /volume1/docker/vommeal/source
   sudo docker compose up -d --build
   ```
   Portainer will then auto-discover the running container and let you manage it from the UI under **Containers**.

---

## 5. First-run configuration

Once the container is healthy:

1. Open `http://<nas-ip>:3333` in your browser
2. Go to **Settings** (bottom nav)
3. Add:
   - **Mealie URL + API token** (if you use Mealie)
   - **Home Assistant URL + long-lived access token + todo entity** (if you want the shopping list to sync with Google Keep via HA)
   - **User names** (yours + partner's) — used for meal suggestions
4. Save. Your meal plan page will prompt you to pick which user you are (this is remembered per browser).

---

## 6. Updating Vommeal later

When there's a new version of the code:

1. Copy the updated source files into `/volume1/docker/vommeal/source/`, replacing the old ones (keep `data/` untouched)
2. In Portainer → **Stacks** → `vommeal` → **Editor** → scroll down, click **Update the stack** with **Re-pull image and redeploy** disabled but **Force rebuild** enabled
3. Or via SSH:
   ```bash
   cd /volume1/docker/vommeal/source
   sudo docker compose up -d --build
   ```

Your SQLite database in `data/` survives updates.

---

## 7. Access from outside your home network (optional)

Since the container is only exposed on your LAN (port 3333 on the NAS IP), external access requires one of:

- **Tailscale** (recommended) — install on your NAS and phone, access via the NAS's tailnet IP. No config changes needed, no ports opened. This is what I use.
- **Synology reverse proxy** on a custom domain — works but requires HTTPS cert and opens the app to anyone who guesses the URL. Add authentication (Authelia, or DSM's built-in SSO) before doing this.

**Do not port-forward 3333 directly on your router.** The app has no built-in authentication and would be wide open to the internet.

---

## Backups

The entire app state lives in `/volume1/docker/vommeal/data/vommeal.db`. Back that file up and you can restore everything. Hyper Backup or a simple cron'd `cp` both work.

---

## Troubleshooting

- **Build fails with native module errors:** The `better-sqlite3` compile step needs the `python3 make g++` packages — the Dockerfile installs them via `apk add`. If it still fails, check Portainer's build logs for the actual error.
- **"Cannot reach Home Assistant":** The HA URL must be reachable from inside the Docker network. Use the NAS's LAN IP (e.g. `http://192.168.0.16:8123`), not `localhost` or `127.0.0.1`.
- **Recipe images don't load:** Make sure Mealie is served over HTTPS. The Next.js image proxy only allows `https://` hosts by default (security hardening).
- **Port 3333 already in use:** Change the left side of `"3333:3000"` in the compose file to a free port.
