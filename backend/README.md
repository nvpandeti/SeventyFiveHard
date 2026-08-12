# PocketBase Backend

This folder is where you drop the PocketBase binary and run the local
backend that the mobile app talks to via a Cloudflare Tunnel.

Tested with **PocketBase v0.23+ / v0.39.x** (current stable).

## 1. Install PocketBase

Download the binary for your OS from https://pocketbase.io/docs/ and
place it in this folder:

- Windows: `pocketbase.exe`
- macOS / Linux: `pocketbase`

## 2. Run PocketBase

From this folder:

```powershell
# Windows
./pocketbase.exe serve --http="0.0.0.0:8090"
```

```bash
# macOS / Linux
./pocketbase serve --http="0.0.0.0:8090"
```

Open the Admin UI at http://localhost:8090/_/ and create the first
superuser.

## 3. Set up collections

PocketBase auto-creates a `users` auth collection out of the box. You
only need to add two custom fields to it and then import the
`daily_logs` collection.

### 3a. Add custom fields to `users`

In the Admin UI:

1. Open **Collections** → click the built-in **users** collection.
2. Click **+ New field** and add:
   - `current_day` — type **Number**, min `1`, max `75` (not required)
   - `start_date` — type **Date** (not required)
3. **(Recommended for a friends-only app)** Loosen the read rules so the
   feed can show everyone, and allow app sign-up. Click the "API Rules"
   tab and set:
   - **List rule**: `@request.auth.id != ""`
   - **View rule**: `@request.auth.id != ""`
   - **Create rule**: leave empty (public signup enabled)
   - Leave **Create / Update / Delete rules** alone (defaults keep users
     only able to edit themselves).
4. Click **Save changes**.

### 3b. Import `daily_logs`

1. In the Admin UI go to **Settings → Import collections**.
2. Click **Load from JSON file** and pick
   [`pb_schema.json`](./pb_schema.json), or paste its contents into the
   text area.
3. **Enable the "Merge with existing collections" toggle** (right above
   the "Review" button). Without this, PocketBase will try to delete
   every other collection because it's not in the imported JSON.
4. Click **Review** — it should show a single new `daily_logs`
   collection being added with no changes to existing ones.
5. Click **Confirm and import**.

That's it. Rules are already set so any signed-in user can list/view
everyone's logs (for the feed), but only the owner can create/update/
delete their own rows.

> **If import still fails with "Invalid collections configuration"**,
> the fastest workaround is to skip the import entirely and create
> `daily_logs` by hand:
>
> 1. **Collections → + New collection → Base**, name `daily_logs`.
> 2. Add fields matching [`pb_schema.json`](./pb_schema.json):
>    `user` (Relation → users, single, cascade delete),
>    `date` (Date),
>    `diet_ok`, `workout_1`, `workout_2`, `water_ok`, `reading_ok`,
>    `completed` (all Bool),
>    `progress_photo` (File, max 1, images only).
> 3. **Indexes** tab: add `CREATE UNIQUE INDEX idx_user_date ON daily_logs (user, date)`.
> 4. **API Rules** tab: set list/view to `@request.auth.id != ""`, and
>    create/update/delete to
>    `@request.auth.id != "" && user = @request.auth.id`.

## 4. Expose the backend with Cloudflare Tunnel

You need `cloudflared` — Cloudflare's tunnel client — to give your
friends' phones an HTTPS URL that reaches PocketBase on your PC.

### 4a. Install `cloudflared`

**Windows (winget, recommended):**

```powershell
winget install --id Cloudflare.cloudflared
```

**Windows (Scoop / Chocolatey alternative):**

```powershell
scoop install cloudflared
# or
choco install cloudflared
```

**macOS:**

```bash
brew install cloudflared
```

**Linux (Debian / Ubuntu):**

```bash
# Add Cloudflare's package repo (one-time)
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update
sudo apt-get install cloudflared
```

**Any OS (manual):** download the binary from
https://github.com/cloudflare/cloudflared/releases and add it to your
PATH.

Verify:

```powershell
cloudflared --version
```

> **Windows: "'cloudflared' is not recognized" right after `winget install`?**
> `winget` updates the system PATH but your current terminal already
> cached the old one. Fix without rebooting — reload PATH in the current
> session:
>
> ```powershell
> $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
> cloudflared --version
> ```
>
> Or just **close and reopen the terminal** (VS Code terminals need a
> fresh terminal, not just a new tab in the same session). If it still
> can't find it, the binary is at
> `C:\Program Files (x86)\cloudflared\cloudflared.exe` — you can call it
> with the full path or add that folder to PATH manually via
> `System Properties → Environment Variables`.

### 4b. Option A — Quick tunnel (no Cloudflare account, easy)

Fastest path. In a **second terminal** (leave PocketBase running in the
first):

```powershell
cloudflared tunnel --url http://localhost:8090
```

You'll see output ending with a line like:

```
Your quick Tunnel has been created! Visit it at:
https://random-subdomain.trycloudflare.com
```

Copy that URL — that's your `EXPO_PUBLIC_PB_URL`.

> ⚠️ Quick tunnel URLs are **ephemeral**: they change every time you
> restart `cloudflared`, and Cloudflare may rate-limit or shut them
> down. Great for testing, painful long-term (you'll have to update the
> `.env` and re-share the QR code every restart).

### 4c. Option B — Named tunnel (stable URL, recommended for the crew)

Requires a free Cloudflare account and a domain added to Cloudflare
(free plan is fine). Gives you a permanent URL like
`https://pb.yourdomain.com`.

```powershell
# 1. One-time login (opens a browser to authorize)
cloudflared tunnel login

# 2. Create a named tunnel — this creates a credentials .json file
#    under ~/.cloudflared/<TUNNEL_ID>.json
cloudflared tunnel create seventyfivehard

# 3. Route a DNS name on your domain to the tunnel
cloudflared tunnel route dns seventyfivehard pb.yourdomain.com
```

Then create a config file at `~/.cloudflared/config.yml` (Windows:
`%USERPROFILE%\.cloudflared\config.yml`):

```yaml
tunnel: seventyfivehard
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: pb.yourdomain.com
    service: http://localhost:8090
  - service: http_status:404
```

Run it:

```powershell
cloudflared tunnel run seventyfivehard
```

Your stable URL is now `https://pb.yourdomain.com`. Use that as
`EXPO_PUBLIC_PB_URL` and you never have to touch the `.env` again.

> **Optional:** install as a service (`cloudflared service install`)
> so the tunnel restarts with your PC.

> 🔒 **Never commit** `~/.cloudflared/*.json` or `config.yml` — they
> contain the tunnel's private credentials. The project `.gitignore`
> already blocks `.cloudflared/` and `*.cloudflared.json` at the repo
> root, but the real files live in your home directory and should stay
> there.

## 5. Point the mobile app at the tunnel

In the project root create a `.env` file (see `.env.example`) and set:

```
EXPO_PUBLIC_PB_URL=https://<random>.trycloudflare.com
```

Restart the Expo dev server so the new env var is picked up.

## 6. Create user accounts for friends

From the Admin UI → **Collections → users → + New record**. Set an
email and password for each friend and share the credentials. They
install **Expo Go**, scan the QR code from `npx expo start --tunnel`,
and sign in.

## 7. Rollover audit history

Rollover runs are now persisted for historical inspection in two
collections:

1. `rollover_runs` (one row per rollover execution)
    - `trigger`: `cron` or `manual_admin`
    - `rollover_date`: the day being evaluated
    - `today_date`: the day users are moved into
    - `summary`: final run summary payload
    - `touched_records_count`: number of detailed change rows captured
    - `metadata.capturedAtISO`: capture timestamp
2. `rollover_run_changes` (one row per touched entity change)
    - `rollover_run`: relation to the parent run
    - `user_id`: affected user
    - `change_type`: e.g. `auto_complete_log`, `progress_user`,
       `create_missed_log`, `reset_user`, `sync_current_day_number`
    - `entity_type` + `entity_id`: changed model identity
    - `effective_date`: logical date for this change
    - `before_data`, `after_data`, `delta`: value-level diff payloads

### How to inspect

- In Admin UI:
   - Open `rollover_runs`, sort by `created` descending.
   - Open one run and use the `rollover_run_changes` relation to inspect
      all touched records and before/after deltas.
- Via API:
   - List recent runs: `/api/collections/rollover_runs/records?sort=-created`
   - Fetch change rows for one run:
      `/api/collections/rollover_run_changes/records?filter=rollover_run%3D%22<RUN_ID>%22&sort=created`
