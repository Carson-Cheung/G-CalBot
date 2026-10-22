# 📅 Google Calendar Discord Bot & Activity

A Discord bot and interactive Activity that connects users to their Google Calendar via their private iCal link, providing automated DM reminders and dynamic live syncing without exposing their Gmail address to other members.

---

## ✨ Features

- **🛡️ 100% Privacy Protected**:
  - Uses Google Calendar's **Secret iCal URL**.
  - All slash commands (`/calendar link`) and the Activity web UI are **ephemeral/private** — your Gmail address and secret link are never broadcast to other server members.
- **🔄 True Auto-Updating**:
  - Never need to paste a new link when your calendar changes.
  - The bot dynamically re-fetches the live Google feed, picking up new, edited, rescheduled, or deleted events automatically.
- **🔔 Background DM Reminders (24/7)**:
  - Runs in the background and sends rich Discord direct messages before each event starts.
  - Customizable alert timing: At event start (0m), 5m, 10m (default), 15m, 30m, or 1 hour prior.
  - Full recurring event support (RRULE) and timezones.
- **🚀 Discord Activity & Web Hub**:
  - Embedded Discord Activity interface (or browser dashboard).
  - Clean Discord dark-mode UI with live status badge, upcoming event list, test DM trigger, and one-click unlinking.
- **☁️ 100% Free Hosting Ready**:
  - Uses pure-JavaScript dependencies and zero native C++ compilation.
  - Installs cleanly on Windows, macOS, Linux, and cloud containers.

---

## 📁 Project Architecture

```
G-CalBot/
├── public/
│   └── index.html          # Sleek Discord Activity frontend
├── src/
│   ├── index.ts            # Entrypoint (starts Bot & Express server)
│   ├── config.ts           # Environment variable loader
│   ├── types.ts            # Data models & interfaces
│   ├── db/
│   │   └── storage.ts      # Zero-native JSON database with atomic writes
│   ├── bot/
│   │   ├── client.ts       # Discord.js bot client & slash registration
│   │   └── commands/
│   │       ├── calendar.ts # /calendar (link, unlink, view, settings, test, guide)
│   │       └── activity.ts # /activity (launcher for Discord Activity)
│   ├── calendar/
│   │   ├── syncService.ts  # Fetches & parses ICS, handles RRULE recurring events
│   │   └── reminderEngine.ts # Background cron loop that fires DM notifications
│   └── server/
│       └── app.ts          # Express API & Activity backend
├── .env.example
├── tsconfig.json
└── package.json
```

---

## 🛠️ Step 1: Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g. `Google Calendar`).
3. Under **General Information**:
   - Copy the **Application ID** (this is your `DISCORD_CLIENT_ID`).
4. Under **OAuth2**:
   - Copy the **Client Secret** (this is your `DISCORD_CLIENT_SECRET`).
   - (For Discord Activity only) Under **Redirects**, add: `http://localhost:3000` (and later your cloud host URL).
5. Under **Bot**:
   - Click **Reset Token** and copy the token (this is your `DISCORD_TOKEN`).
   - Enable **Privileged Gateway Intents** if needed (or standard intents).
6. Under **OAuth2 > URL Generator**:
   - Scopes: check `bot`, `applications.commands`.
   - Bot Permissions: check `Send Messages`, `Embed Links`, `Use External Emojis`, `Read Message History`.
   - Copy the generated URL and open it in your browser to invite the bot to your Discord server.
7. (Optional - For Discord Activity):
   - Under **Activities**, enable Activity testing and set the URL mapping to your server URL.

---

## 💻 Step 2: Local Testing on Your Computer

1. **Clone or open this repository** in VS Code.
2. **Create your `.env` file**:
   Copy `.env.example` to `.env`:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_application_client_id_here
   DISCORD_CLIENT_SECRET=your_client_secret_here
   PORT=3000
   SYNC_INTERVAL_MINUTES=5
   ```
3. **Start the development server**:
   ```bash
   npm run dev
   ```
4. You will see:
   ```
   🌐 Web & Activity server listening at http://localhost:3000
   🤖 Discord bot logged in as Google Calendar#1234!
   ✅ Application slash commands registered successfully!
   ```
5. Open `http://localhost:3000` in your browser to test the Activity UI, or use slash commands directly inside Discord!

---

## 📖 How Users Connect Google Calendar

Users do not need to share their calendar publicly or expose their email address.

1. In Google Calendar ([calendar.google.com](https://calendar.google.com)):
   - Under **My calendars** on the left, hover over your calendar, click the three dots (**⋮**), and choose **Settings and sharing**.
   - Scroll down to the **"Integrate calendar"** section.
   - Locate **"Secret address in iCal format"** (do NOT use the Public address).
   - Click the copy button.
2. In Discord:
   - Type `/calendar link url:<paste your link>`
   - Or open the Discord Activity and paste the link in the input box.
3. The bot immediately validates the feed, previews upcoming events, and starts scheduling automated reminders!

---

## 🤖 Slash Commands

| Command | Short Alias | Description |
| :--- | :--- | :--- |
| `/calendar link <url> [name]` | `/cal link` | Privately connects a Google Calendar or course feed (.ics) with an optional label (e.g. `Crow`, `D2L`, `Family`). |
| `/calendar share [until]` | `/cal share` | Posts your upcoming schedule publicly in chat (`tdy`, `tmr`, `3d`, `1w`, or custom number of days/weeks). |
| `/calendar list` | `/cal list` | Lists all your connected calendars with their IDs and added dates. |
| `/calendar unlink [calendar]` | `/cal unlink` | Disconnects a specific calendar by name or unlinks all. |
| `/calendar view` | `/cal view` | Displays merged upcoming events from all your calendars with tags and interactive buttons. |
| `/calendar settings <minutes>` | `/cal settings` | Sets alert lead time: At start (0m), 5m, 10m (default), 15m, 30m, 1h. |
| `/calendar test` | `/cal test` | Dispatches an instant test reminder DM to confirm Discord DM settings. |
| `/calendar guide` | `/cal guide` | Step-by-step visual tutorial on finding your secret iCal link. |
| `/open` | `/o` | Sends an instant direct button link to open Google Calendar in browser. |
| `/activity` | `/act` | Launches the interactive Discord Activity hub. |

---

## ☁️ Free Hosting Guide

You can easily host this bot 24/7 on free container platforms like **Render**, **Railway**, or **Koyeb**:

### Deploying to Render (Free Tier):
1. Push your repository to GitHub (ensure `.env` and `data/` are in `.gitignore`).
2. Go to [render.com](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
5. Under **Environment Variables**, add:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `PORT`: `3000`
6. Click **Create Web Service**. Once deployed, Render provides a free HTTPS URL (e.g. `https://my-calbot.onrender.com`) which you can also plug directly into Discord Developer Portal for the Activity!
