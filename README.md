# Competitive Programming Contest Management Agent (CF-Agent)

An autonomous, self-hosted Competitive Programming Contest Management Agent designed to monitor Codeforces contests, synchronize them with Google Tasks, track user participation, dynamically update metadata-driven task lifecycles, and run continuously on your own infrastructure or cloud platforms.

Built entirely using modern **native JavaScript (ES Modules)**, the system runs with **zero compilation overhead** and executes instantly on Node.js, Docker, and Vercel.

## 🚀 Features

- **Bidirectional Google Tasks Sync**: Maps each Codeforces contest to a single Google Task. Automatically sets elegant status titles (e.g. `[UPCOMING]`, `[LIVE 🔴]`, `[DONE ✅]`, `[MISSED ❌]`) and stores clean, hand-written task notes containing your solves and standings.
- **Participation Detection**: Auto-detects official contest ratings and parses user submissions during contest windows. Computes statistics: Solved Count, Wrong Submissions (correctly counting only wrong attempts made *before* the first correct answer for each problem!), Standings Rank, and Rating Delta.
- **Retention & Cleanup**: Automated removal of unattempted missed tasks after a configurable retention window (default: 3 days) to keep your tasks list completely clean.
- **⏰ Temporary Google Calendar Alarms**: Google Tasks' developer API has a hard platform limitation that discards precise alarm times. 
  - To solve this without creating cluttered duplicates on your screen, the agent **natively creates a temporary event on your Google Calendar** scheduled at the exact start time of the contest.
  - This event triggers a **real, ringing pop-up notification / phone alarm exactly 15 minutes before the contest starts**.
  - The moment the contest begins (live transition), the agent **automatically deletes the Calendar event**, keeping your calendar completely clean and free of duplicates, while leaving the Google Task active to manage your checklists!
- **Hybrid Architecture**: 
  - **Self-Hosted Daemon (SQLite)**: Runs locally in a lightweight Docker container or systemd service using local file storage SQLite.
  - **Serverless Vercel-Ready (Turso)**: Deploys statelessly to Vercel triggered by Vercel Cron, connecting to a serverless SQLite database (Turso) over HTTP using the **exact same code** and native `.js` handlers.
- **Resilient Engine**: Robust exponential backoff API retries for Codeforces APIs (highly prone to 503 errors during active contests).
- **Graceful Control**: Standard OS signal handling for persistent processes and manual CLI synchronization modes.

---

## 🛠️ Architecture & Lifecycle

```
                     [ Codeforces API ]
                             │  (Fetch public contests,
                             │   user status & rating changes)
                             ▼
[ Self-Hosted Daemon ] ──► [ Core Contest Agent ] ◄── [ Serverless Vercel ]
(Local SQLite / Croner)           │                    (Turso SQLite / Cron)
                                  ├────────────────────┐
                                  ▼                    ▼
                          [ Google Tasks API ]   [ Google Calendar API ]
                        (Sync Checklist & Stats)  (Auto-Delete Temp Alarms)
```

### Contest State Transitions:
```
  [*] ──► scheduled ──► live ──► attempted (solved > 0) ──► archived (rating updated)
          (Alarm Event      (Alarm  ├──► partial (solved == 0)  ──► archived
           Created)         Deleted)└──► missed (no submissions) ──► deleted (retention expired)
```

---

## ⚙️ Configuration Setup

### Step 1: Google API Credentials Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and search for **Google Tasks API**, then click **Enable**.
3. In the search bar at the top, search for **Google Calendar API**, then click **Enable**. (Both APIs must be enabled for the project!).
4. Go to the **OAuth Consent Screen** tab, configure a basic screen (User Type: **External**), and add your Gmail address as a **Test User**.
5. Go to **Credentials** -> **Create Credentials** -> **OAuth Client ID**.
6. Select Application Type: **Desktop Application** (This is the simplest option for command-line tools).
7. Click **Create** and download the client secret JSON file.
8. Rename the downloaded file to `credentials.json` and place it in the `data/` directory of this project (`data/credentials.json`).

### Step 2: Set up Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```
Key variables:
- `CF_HANDLE`: Your Codeforces handle (e.g. `tourist`).
- `GOOGLE_TASKLIST_ID`: Set to `@default` (primary list) or a custom name like `Codeforces` (the agent will auto-create this list on Google Tasks if it doesn't exist!).
- `TIMEZONE`: Local timezone identifier (e.g., `Asia/Kolkata` or `America/New_York`).
- `DELETE_UNATTEMPTED`: `true` to delete task when unattempted contest expires, `false` to keep.
- `MISSED_RETENTION_DAYS`: Days to keep a `[MISSED ❌]` task on Google Tasks before deleting.

---

## 🔑 Bootstrapping Google OAuth (First-Time Run)

Before starting the daemon, you must perform a one-time interactive OAuth verification to authorize your agent to edit your Google Tasks and Calendar alarms. Run this locally on your shell:

```bash
npm run oauth
```

1. It will output a Google verification URL. Copy and open it in your browser.
2. Sign in, authorize the app permissions, and proceed through warnings (standard for self-hosted apps).
3. Google will present you with an **Authorization Code** (or redirect you to a blank page where the code is in the browser address bar like `?code=4/0Af...`).
4. **Copy the complete URL** directly from your browser's address bar and paste it back into your terminal prompt. (The script will automatically parse the URL and extract the code for you!).
5. **Boom!** A `token.json` is generated under `data/token.json` allowing the agent to run completely unattended.
6. *Note*: The script will also output a stringified JSON block of the token. Keep this safe; if you deploy to Vercel, you can copy-paste it directly as an environment variable `GOOGLE_OAUTH_TOKEN_JSON`!

---

## 📦 Deployment Methods

### Option A: Self-Hosted Docker Compose (Recommended)
Excellent for VPS, home labs, or Docker environments. The database is persistent locally.

1. Ensure `data/credentials.json` and `data/token.json` exist.
2. Start the daemon in the background:
   ```bash
   docker-compose up -d
   ```
3. Watch the structured log output:
   ```bash
   docker logs -f cf-contest-agent
   ```

### Option B: Native systemd Service
To deploy natively on a Linux host (e.g., Ubuntu VPS).

1. Install Node.js (v18+):
   ```bash
   npm install
   ```
2. Copy the files to `/opt/cf_agent`:
   ```bash
   sudo mkdir -p /opt/cf_agent
   sudo cp -r src api scripts package.json data .env /opt/cf_agent/
   ```
3. Copy the systemd service template to the systemd directory:
   ```bash
   sudo cp cf-agent.service /etc/systemd/system/cf-agent.service
   ```
4. Reload systemd, enable the service to run on boot, and start it:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable cf-agent
   sudo systemctl start cf-agent
   ```
5. Check status and log files:
   ```bash
   sudo systemctl status cf-agent
   journalctl -u cf-agent -f
   ```

### Option C: Stateless Serverless Deployment on Vercel
Deploy to Vercel in seconds with **zero server cost**.

1. Create a serverless SQLite database on **Turso** (free tier).
2. Set your environment variables in Vercel:
   - `CF_HANDLE`: your_handle
   - `DATABASE_URL`: `libsql://your-db-name.turso.io`
   - `DATABASE_AUTH_TOKEN`: your_turso_auth_token
   - `GOOGLE_OAUTH_TOKEN_JSON`: [Your stringified OAuth token block printed by `npm run oauth`]
   - `GOOGLE_CREDENTIALS_PATH`: `data/credentials.json` (Ensure `credentials.json` is in your Git repo under `data/` or configure client variables manually).
3. Connect your Git repository to Vercel. Vercel will automatically deploy it.
4. **Vercel Cron** (`vercel.json`) is pre-configured and will automatically trigger the endpoints at scheduled times:
   - `/api/upcoming`: Syncs newly scheduled contests (every 15 min).
   - `/api/live`: Updates active contests to Live state and deletes temporary alarm events (every 5 min).
   - `/api/cleanup`: Checks ended contests, syncs solved statistics, and cleans up any residual alarms (every 30 min).

---

## 🛠️ CLI Operations & Troubleshooting

You can manually trigger synchronization cycles on-demand using CLI arguments (bypassing the scheduler):

```bash
# Trigger immediate upcoming contest sync
npm start -- --sync-type upcoming

# Trigger immediate live contest sync
npm start -- --sync-type live

# Trigger immediate cleanup & archival
npm start -- --sync-type cleanup
```

---

## 🧪 Running Tests

A complete unit test suite verifies calculations and metadata sync:

```bash
npm run test
```
