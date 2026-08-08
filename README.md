# SeventyFiveHard

A React Native mobile app my friends and I use to keep each other
accountable through the [75 Hard](https://andyfrisella.com/pages/75hard-info)
challenge. It runs on Expo Go and talks to a self-hosted **PocketBase**
backend exposed to the internet with a **Cloudflare Tunnel**, so the
whole thing lives on your PC while everyone can still use it from their
phones.

```
Expo Go on phones  →  Cloudflare Tunnel (HTTPS)  →  Your PC (localhost:8090)  →  PocketBase (SQLite + files)
```

## Features

- 📱 Daily dashboard with the five 75 Hard tasks
  - Diet, Workout #1, Workout #2 (outdoors), Water (1 gal), Reading (10 pages)
- 📸 Take or upload a progress photo for the day
- ✅ Submit-day flow that only unlocks once everything is checked
- 👥 Real-time-ish social feed with everyone's check-ins for today
- 👤 Profile page with day counter and recent history
- 🔐 Email/password auth via PocketBase, persisted with AsyncStorage

## Tech stack

- **Expo SDK 57** + React Native + TypeScript
- **PocketBase** (`pocketbase` JS SDK)
- **React Navigation** (bottom tabs + native stack)
- **expo-image-picker** for camera / library photo capture
- **@react-native-async-storage/async-storage** for auth persistence

## Project layout

```
App.tsx                 # Providers + root navigator
src/
  config.ts             # PB_URL and challenge constants
  navigation.tsx        # Auth stack + main tab navigator
  context/              # AuthContext (PocketBase-backed)
  lib/                  # pocketbase client + logs helpers
  screens/              # SignIn, SignUp, Today, Feed, Profile
  components/           # Button, TextField, TaskCheckItem
  theme/                # Colors, spacing, typography
  types/                # AppUser, DailyLog, TASKS definitions
  utils/                # date helpers
backend/                # PocketBase setup + collection schema
```

## Getting started

### 1. Install app dependencies

```powershell
npm install
```

### 2. Set up the PocketBase backend

Follow [`backend/README.md`](./backend/README.md):

1. Drop the `pocketbase` binary in `backend/`.
2. Run `./pocketbase.exe serve --http="0.0.0.0:8090"`.
3. In the Admin UI at http://localhost:8090/_/, add `current_day`
   (number) and `start_date` (date) fields to the built-in `users`
   collection, then loosen its list/view rules to
   `@request.auth.id != ""`.
4. Import [`backend/pb_schema.json`](./backend/pb_schema.json) to create
   the `daily_logs` collection (Settings → Import collections).
5. In a second terminal, expose it publicly:
   ```bash
   cloudflared tunnel --url http://localhost:8090
   ```

### 3. Point the app at your tunnel

Copy `.env.example` → `.env` and paste your Cloudflare Tunnel URL:

```
EXPO_PUBLIC_PB_URL=https://random-subdomain.trycloudflare.com
```

### 4. Run the app

```powershell
# Start the Metro bundler with a tunnel so friends on other networks
# can scan the QR code from Expo Go.
npx expo start --tunnel
```

Then:

- **You / friends** open **Expo Go** on their phone and scan the QR code
- Sign in with the account you created for them in the PocketBase Admin
- Start checking in every day

Alternate scripts:

- `npm run android` – open in Android emulator
- `npm run ios` – open on iOS simulator (macOS only)
- `npm run web` – run the app in a browser (limited)

## Notes

- The Cloudflare quick tunnel URL changes every time you restart it. If
  you want a stable URL, set up a named tunnel via the Cloudflare
  dashboard.
- Progress photos are stored in PocketBase's `pb_data/storage/` folder
  on your PC. That folder is gitignored.
- API rules are permissive on read (any signed-in user can see any log)
  so the feed works, but writes are locked to the log's owner.

## License

See [`LICENSE`](./LICENSE).
