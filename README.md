# G-CalBot

A Discord bot and embedded Activity that sends calendar reminders, merges multiple calendars, and lets you share your schedule in chat.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-00E599?logo=postgresql&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green?logo=node.js&logoColor=white)

## Overview

G-CalBot links your Discord account to Google Calendar, university feeds such as D2L or Canvas, or any `.ics` feed. It uses each calendar's secret iCal address, so there's no OAuth consent screen and your email is never shown to other members.

It has two parts:

- **Bot**: checks your feeds in the background and sends reminders to your DMs before events start.
- **Activity**: a dashboard that runs inside Discord, where you manage calendars, browse upcoming events and change reminder settings.

## Features

- **Private by default.** Linking commands and the dashboard are visible only to you. Feed URLs and your email are never shared. Event details (titles, locations, descriptions) *are* shown when you use public commands like `/cal share`.
- **Multiple calendars.** Link up to 10 feeds. Their events are merged and tagged by calendar.
- **Schedule sharing.** `/cal share` posts your upcoming events in chat with Discord timestamps. Ranges: `tdy`, `tmr`, `3d`, `2w` and so on.
- **Paged views.** Schedules show one day per page, with « ‹ › » buttons and a dropdown to filter by calendar.
- **DM reminders.** Choose exactly how early reminders arrive, from the start time up to 7 days before (`45m`, `2h`, `1d`, ...). Recurring events, exceptions and time zones are supported.
- **Daily digest.** An optional morning summary of your day, sent at a time you choose in your time zone.
- **PostgreSQL or local JSON.** Data is stored in PostgreSQL when `DATABASE_URL` is set, or in a local JSON file when it isn't.
- **User-installable.** Add it to your own account and use it in any server, DM or group chat.
- **No native dependencies.** Deploys to free hosting such as Render, Railway or Fly.io without build tools.

## Commands

| Command | Alias | Description | Visibility |
| :--- | :--- | :--- | :--- |
| `/calendar link <url> [name]` | `/cal link` | Connect a Google Calendar or `.ics` feed | Private |
| `/calendar share [until]` | `/cal share` | Post your upcoming schedule (`tdy`, `tmr`, `3d`, `1w`, ...) | **Public** |
| `/calendar daily [time] [enabled] [timezone] [test]` | `/cal daily` | Configure the daily digest | Private |
| `/calendar view` | `/cal view` | Browse the next 7 days, one day per page | Private |
| `/calendar list` | `/cal list` | List connected calendars | Private |
| `/calendar unlink [calendar]` | `/cal unlink` | Remove one calendar, or all of them | Private |
| `/calendar settings [remind_before]` | `/cal settings` | Set the reminder lead time (`45m`, `2h`, `1d`, up to 7 days) | Private |
| `/calendar test` | `/cal test` | Send a test reminder DM | Private |
| `/calendar guide` | `/cal guide` | Step-by-step walkthrough for finding your secret iCal address | Private |
| `/open` | `/o` | Get a button that opens Google Calendar | Private |
| `/dashboard` | `/dash`, `/act` | Launch the Activity dashboard | Channel |
| `/commands` | `/comms` | List every command | Private |
| `/calendar deletedata` | `/cal deletedata` | Permanently delete everything the bot stores about you | Private |

## Connecting a Google Calendar

1. Open [Google Calendar](https://calendar.google.com).
2. Under **My calendars**, hover over the calendar, click **⋮**, then **Settings and sharing**.
3. Scroll to **Integrate calendar**.
4. Copy the **Secret address in iCal format**, not the public address.
5. In Discord, run `/cal link url:<secret address> name:Primary`.

You can also paste the address into the dashboard: run `/dashboard` and open the Activity.

## Self-hosting

Requires Node.js 20 or newer.

```bash
git clone https://github.com/Carson-Cheung/G-CalBot.git
cd G-CalBot
npm install
cp .env.example .env   # then fill in your values
```

`.env.example` lists every setting. The required ones are `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`. In production, also set `SESSION_SECRET` (32+ characters) and `DATABASE_URL`.

```bash
npm run dev         # development, restarts on change
npm run build       # bundle the dashboard and type-check
npm start           # production
npm run db:migrate  # check the database and copy local JSON data into PostgreSQL
```

When `DATABASE_URL` is set, the schema is created on startup and any data in `data/database.json` is copied over automatically.

## Project structure

```text
public/                  Static files served for the Activity
  index.html
  css/styles.css
  js/app.js              Bundled dashboard (built from src/web)
src/
  index.ts               Startup and shutdown for the bot and the web server
  config.ts              Environment settings and validation
  types.ts               Shared data types
  bot/                   discord.js client, slash commands and handlers
  calendar/
    syncService.ts       iCal fetching (with SSRF protection) and recurrence expansion
    reminderEngine.ts    Reminder and daily digest loop
  db/                    Storage layer (PostgreSQL and local JSON), migrations
  server/                Express app, rate limiting, auth and API routes
  utils/                 Sessions, time zone helpers, activity log
  web/                   React dashboard: components, hooks, API client
```

## Security and privacy

- No Google password or OAuth access is ever requested.
- Calendar feeds are fetched only from public hosts. Private and internal addresses are blocked, including through DNS tricks and redirects. Requests have a size limit and a timeout.
- Dashboard sessions are signed tokens. Discord access tokens never reach the browser.
- API routes are rate limited, and every route checks that you own the data you're reading or changing.
- Feed URLs are stored in your database, or in `data/` locally, which is never committed.
- Users can delete everything stored about them with `/cal deletedata`.

See the [Privacy Policy](https://g-calbot.onrender.com/privacy) and [Terms of Service](https://g-calbot.onrender.com/terms).
