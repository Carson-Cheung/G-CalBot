<div align="center">

  <h1>📅 Google Calendar for Discord</h1>
  <p><strong>A privacy-focused Discord Bot & Embedded Activity for 24/7 calendar reminders, multi-calendar synchronization, and public schedule sharing.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?logo=discord&logoColor=white" alt="Discord.js">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green?logo=node.js&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
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

- **🛡️ 100% Privacy Protected**  
  Uses Google Calendar's **Secret iCal Address**. All linking commands and web dashboards are private/ephemeral — your Gmail address and secret URLs are never shared with other server members.
- **🔄 Multi-Calendar Support**  
  Link multiple schedules simultaneously (e.g., Primary Google Calendar, university D2L/Canvas feeds, clubs, or work). Events are merged and tagged automatically.
- **📢 Public Schedule Sharing (`/cal share`)**  
  Share your schedule directly in channel chat for friends or teammates with dynamic Discord timestamps, custom timeframes (`tdy`, `tmr`, `3d`, `2w`), and zero email leaks.
- **🔔 24/7 Background DM Reminders**  
  Automated alerts sent straight to your DMs before events begin. Configurable lead times: at start (0m), 5m, 10m (default), 15m, 30m, or 1 hour prior. Full support for recurring events (`RRULE`) and timezones.
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
| `/calendar view` | `/cal view` | Displays merged upcoming events from all your calendars with direct calendar links. | Private |
| `/calendar list` | `/cal list` | Lists all your connected calendars with their unique IDs and added dates. | Private |
| `/calendar unlink [calendar]` | `/cal unlink` | Disconnects a specific calendar by name/ID, or unlinks all feeds. | Private |
| `/calendar settings <minutes>`| `/cal settings` | Customizes reminder alert lead times (0m, 5m, 10m, 15m, 30m, 1h). | Private |
| `/calendar test` | `/cal test` | Sends an instant test reminder DM to verify Discord privacy settings. | Private |
| `/calendar guide` | `/cal guide` | Step-by-step tutorial on finding your Google Calendar private iCal address. | Private |
| `/open` | `/o` | Sends a direct 1-click button to open Google Calendar in your browser. | Private |
| `/activity` | `/act` | Launches the embedded Discord Activity dashboard. | Channel |

---

## 📖 How to Connect Your Calendar

1. Open [Google Calendar](https://calendar.google.com) in your browser.
2. In the left sidebar under **My calendars**, hover over your calendar, click the three dots (**⋮**), and select **Settings and sharing**.
3. Scroll down to the **Integrate calendar** section.
4. Locate **Secret address in iCal format** and click **Copy**.  
   *(⚠️ Do not use the Public address; use the Secret address).*
5. In Discord, run:
   ```text
   /cal link url: <paste your secret link> name: Primary
   ```
6. Or click **Launch Activity** to paste and manage feeds in the visual dashboard.

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
   ```

4. **Run the bot:**
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
│   ├── index.html          # Embedded dark-mode dashboard
│   ├── logo.svg            # Custom SVG branding
│   └── icon-dark.png       # Dark-mode application icon
├── src/
│   ├── index.ts            # Application bootstrap (Bot + Express API)
│   ├── config.ts           # Environment configuration loader
│   ├── types.ts            # TypeScript interfaces & data models
│   ├── bot/
│   │   ├── client.ts       # Discord.js client & global/guild command registrar
│   │   ├── const.ts        # Command identifiers & constants
│   │   └── commands/       # Slash command handlers (/cal, /act, /o, launch)
│   ├── calendar/
│   │   ├── syncService.ts  # RFC 5545 iCal parser, recurrence & timezone handler
│   │   └── reminderEngine.ts # Background cron loop for 24/7 automated alerts
│   ├── db/
│   │   └── storage.ts      # Lightweight atomic JSON storage engine
│   └── server/
│       └── app.ts          # Express API & Activity backend
├── package.json
└── tsconfig.json
```

---

## 🔒 Security & Privacy

- **Zero Credential Sharing**: We never ask for your Google account password or full OAuth permissions.
- **Ephemerality**: Calendar links and raw schedule queries are ephemeral and visible only to you.
- **Data Isolation**: Multi-calendar tokens and private `.ics` URLs are stored locally on the server in atomic JSON storage (`data/database.json`), strictly excluded from source control.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
