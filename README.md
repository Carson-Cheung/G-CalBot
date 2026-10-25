<div align="center">

  <h1>📅 Google Calendar for Discord</h1>
  <p><strong>A privacy-focused Discord Bot & Embedded Activity for 24/7 calendar reminders, multi-calendar synchronization, and public schedule sharing.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord&logoColor=white" alt="Discord.js">
    <img src="https://img.shields.io/badge/PostgreSQL-Neon-00E599?logo=postgresql&logoColor=white" alt="Neon PostgreSQL">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green?logo=node.js&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/Privacy-100%25%20Protected-brightgreen" alt="Privacy">
  </p>

</div>

---

## 🌟 Overview

**G-CalBot** connects Discord users to their Google Calendar and university iCal feeds without ever requiring complex OAuth consent screens or exposing personal email addresses to server members. 

Built as a hybrid system:
- **Background Bot**: Continuously checks feeds 24/7 and delivers rich direct message (DM) alerts before upcoming events.
- **Embedded Activity (Web Hub)**: A dark-mode dashboard running directly inside Discord voice/text channels to manage connected calendars, view upcoming events, and customize alert timings.

---

## ✨ Features

- **🛡️ Privacy Protected**  
  Uses Google Calendar's **Secret iCal Address**. All linking commands and web dashboards are private/ephemeral — your Gmail address and secret URLs are never shared with other server members. *(Disclaimer: Information in calendar entries like event titles, locations, and descriptions can be visible in Discord embeds — keep this in mind when using public commands like `/cal share`).*
- **🔄 Multi-Calendar Support**  
  Link multiple schedules simultaneously (e.g., Primary Google Calendar, university D2L/Canvas feeds, clubs, or work). Events are merged and tagged automatically.
- **📢 Public Schedule Sharing (`/cal share`)**  
  Share your schedule directly in channel chat for friends or teammates with dynamic Discord timestamps, custom timeframes (`tdy`, `tmr`, `3d`, `2w`), and zero email leaks.
- **🔔 24/7 Background DM Reminders**  
  Automated alerts sent straight to your DMs before events begin. Configurable lead times: at start (0m), 5m, 10m (default), 15m, 30m, or 1 hour prior. Full support for recurring events (`RRULE`) and timezones.
- **🐘 Neon PostgreSQL & Local JSON Hybrid Storage**  
  Native support for serverless Neon PostgreSQL for persistent multi-user storage across container restarts and cloud redeployments. Automatically falls back to local JSON caching when `DATABASE_URL` is omitted.
- **🚀 User-Installable (Use Anywhere)**  
  Installable directly to your personal Discord account so you can run slash commands and access your schedule across **any server**, DMs, or group chats.
- **☁️ Zero-Native Dependencies**  
  Built with pure-JavaScript dependencies (no C++ compiler requirements like `better-sqlite3`), allowing effortless 1-click deployments on free tiers (Render, Railway, Fly.io, etc.).

---

## 🤖 Slash Commands

All commands feature short convenience aliases for quick typing:

| Command | Short Alias | Description | Visibility |
| :--- | :--- | :--- | :--- |
| `/calendar link <url> [name]` | `/cal link` | Privately connects a Google Calendar or course `.ics` feed with a custom label. | Private |
| `/calendar share [until]` | `/cal share` | Posts upcoming schedule in chat (`tdy`, `tmr`, `3d`, `1w`, or custom number of days/weeks). | **Public** |
| `/calendar daily [time] [enabled] [timezone] [test]` | `/cal daily` | Configures daily morning schedule digest to DMs at a chosen 24h time and IANA timezone. | Private |
| `/calendar view` | `/cal view` | Displays merged upcoming events from all your calendars with direct calendar links. | Private |
| `/calendar list` | `/cal list` | Lists all your connected calendars with their unique IDs and added dates. | Private |
| `/calendar unlink [calendar]` | `/cal unlink` | Disconnects a specific calendar by name/ID, or unlinks all feeds. | Private |
| `/calendar settings <minutes>`| `/cal settings` | Customizes reminder alert lead times (0m, 5m, 10m, 15m, 30m, 1h). | Private |
| `/calendar test` | `/cal test` | Sends an instant test reminder DM to verify Discord privacy settings. | Private |
| `/calendar guide` | `/cal guide` | Step-by-step tutorial on finding your Google Calendar private iCal address. | Private |
| `/open` | `/o` | Sends a direct 1-click button to open Google Calendar in your browser. | Private |
| `/dashboard` | `/dash` (`/act`) | Launches the embedded Discord Activity dashboard. | Channel |

---

## 📖 How to Connect Your Calendar

1. Open [Google Calendar](https://calendar.google.com) in your browser.
2. In the left sidebar under **My calendars**, hover over your calendar, click the three dots (**⋮**), and select **Settings and sharing**.
3. Scroll down to the **Integrate calendar** section.
4. Locate **Secret address in iCal format** and click **Copy** (Google may show a security prompt—this is normal).  
   *(⚠️ Do not use the Public address; use the Secret address).*
5. In Discord, run:
   ```text
   /cal link url: <paste your secret link> name: Primary
   ```
6. Or run `/dashboard` (`/dash`) and click **Launch Activity** to paste and manage feeds in the visual dashboard.

---

## 🛠️ Self-Hosting & Deployment

### Quick Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Carson-Cheung/G-CalBot.git
   cd G-CalBot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**  
   Create a `.env` file in the root directory:
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_application_client_id
   DISCORD_CLIENT_SECRET=your_application_client_secret
   PORT=3000
   SYNC_INTERVAL_MINUTES=5

   # Neon PostgreSQL Connection String (Optional - falls back to local JSON if omitted)
   DATABASE_URL=postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. **Database Setup & Automatic Migration:**  
   - **Automatic Startup Migration**: When `DATABASE_URL` is configured, the bot automatically verifies the database schema, ensures the normalized tables (`users`, `linked_calendars`, and `sent_reminders`) exist, and seamlessly migrates any existing local JSON user calendars into Neon PostgreSQL upon startup.
   - **Manual CLI Migration**: You can also run the standalone migration CLI at any time to verify database connectivity and preview migrated users:
     ```bash
     npm run db:migrate
     ```

5. **Run the bot:**  
   ```bash
   # Development mode with hot reloading
   npm run dev

   # Production build
   npm run build
   npm run start
   ```

---

## 📁 Repository Structure

```text
G-CalBot/
├── public/                 # Discord Activity single-page app
│   ├── index.html          # Clean HTML dashboard markup
│   ├── css/
│   │   └── styles.css      # Modular dark-mode stylesheet
│   ├── js/
│   │   └── app.js          # Discord SDK & dashboard client logic
│   ├── logo.svg            # Custom SVG branding
│   └── icon-dark.png       # Dark-mode application icon
├── src/
│   ├── index.ts            # Application bootstrap (Bot + Express API)
│   ├── config.ts           # Environment configuration loader
│   ├── types.ts            # TypeScript interfaces & data models
│   ├── utils/
│   │   └── time.ts         # Timezone, 24h time, and share window helpers
│   ├── bot/
│   │   ├── client.ts       # Discord.js client & interaction router
│   │   ├── deploy-commands.ts # Global & guild slash command registrar
│   │   ├── const.ts        # Command identifiers, colors & constants
│   │   └── commands/       # Modular slash command handlers
│   │       ├── calendar/   # Modular /calendar & /cal commands
│   │       │   ├── builder.ts  # Command schema & subcommands definition
│   │       │   ├── index.ts    # Calendar command routing
│   │       │   └── handlers/   # Individual subcommand implementations (9 files)
│   │       ├── dashboard.ts# /dashboard, /dash, /act (Activity launcher)
│   │       ├── open.ts     # /open & /o (Direct Google Calendar link)
│   │       └── index.ts    # Command aggregator & registry
│   ├── calendar/
│   │   ├── syncService.ts  # RFC 5545 iCal parser, SSRF guard & recurrence handler
│   │   └── reminderEngine.ts # Background loop for 24/7 automated alerts & digests
│   ├── db/
│   │   ├── storage.ts      # Hybrid storage engine (Neon PostgreSQL + local cache)
│   │   ├── postgres.ts     # Neon PostgreSQL pool, schema & transaction operations
│   │   └── migrate.ts      # Standalone database migration CLI
│   └── server/
│       ├── app.ts          # Express server initialization & static middleware
│       └── routes/
│           ├── auth.ts     # Discord OAuth2 token exchange & config routes
│           └── calendar.ts # User calendar CRUD, settings & health routes
├── package.json
└── tsconfig.json
```

---

## 🔒 Security & Privacy

- **Zero Credential Sharing**: We never ask for your Google account password or full OAuth permissions.
- **Ephemerality**: Calendar links and raw schedule queries are ephemeral and visible only to you.
- **SSRF & Feed Validation**: All `.ics` feed requests validate public `http://` and `https://` hosts and enforce strict request timeouts.
- **Data Isolation**: Multi-calendar tokens and private `.ics` URLs are stored in your secure Neon PostgreSQL database (with local JSON fallback in `data/database.json`), strictly excluded from source control.
- **Calendar Entry Visibility Disclaimer**: While calendar feed URLs and user emails remain strictly private, data contained within calendar entries (such as event titles, descriptions, and locations) can be displayed in Discord. Keep this in mind when using public commands like `/cal share`.
