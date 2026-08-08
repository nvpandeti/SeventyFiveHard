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
   feed can show everyone. Click the "API Rules" tab and set:
   - **List rule**: `@request.auth.id != ""`
   - **View rule**: `@request.auth.id != ""`
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

In a second terminal:

```bash
cloudflared tunnel --url http://localhost:8090
```

Copy the generated `https://<random>.trycloudflare.com` URL.

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
