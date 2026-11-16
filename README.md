# RelicRush.io

RelicRush.io is a real-time multiplayer PvPvE extraction RPG.

Players explore a cursed dungeon, collect loot and experience, fight monsters and rival adventurers, steal the central relic, choose temporary upgrades, and bank the relic at their own glowing base.

The public landing page is served at `/`.

The playable game is served at:

```text
/play.html
```

The WebSocket game server is server-authoritative and runs through the same Node.js process.

## Files

- `server.js` — Express server, WebSocket server, game simulation, rooms, bots, rounds, combat, loot, upgrades, and relic extraction.
- `public/index.html` — branded SEO landing page.
- `public/play.html` — game shell and playable game page.
- `public/game.js` — complete browser client and Canvas renderer.
- `public/robots.txt` — crawler instructions.
- `public/sitemap.xml` — XML sitemap.
- `public/favicon.svg` — browser icon.
- `public/og-card.svg` — social sharing image.
- `package.json` — Node.js dependencies and scripts.

## Gameplay

Controls:

- `WASD` or arrow keys: move
- Mouse: aim
- Left mouse button or `F`: attack
- `Space`: dash
- Choose an upgrade whenever you level up

The central relic can be carried by one player. The carrier must reach that player's own base to bank it. If the carrier dies, the relic drops at the death location.

The game includes:

- Gold pickups
- Experience pickups
- Potions
- Rare loot
- Player versus player combat
- Monster combat
- Elite monsters
- Server-controlled bots
- Temporary level upgrades
- Dash movement
- Vampiric attacks
- Attack range upgrades
- Movement upgrades
- Round timers
- Respawning
- Leaderboards
- Private room codes
- Three-minute rounds

## Local setup

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open the landing page:

```text
http://localhost:3000/
```

Open the game directly:

```text
http://localhost:3000/play.html
```

Health check:

```text
http://localhost:3000/health
```

The health endpoint returns JSON and can be used by a hosting provider for readiness checks.

## Environment variables

The application reads:

```text
PORT
```

The hosting provider normally supplies `PORT` automatically. Locally, the application defaults to port `3000`.

Example:

```bash
PORT=3000 npm start
```

No database or additional environment variables are required for this version.

## WebSocket support

The game requires persistent WebSocket support.

The browser automatically uses:

- `ws://` when the site is served over HTTP
- `wss://` when the site is served over HTTPS

Use a Node-compatible host that supports WebSockets, such as:

- Render
- Railway
- Fly.io
- A VPS or dedicated Node.js server

Do not deploy this game to a static-only hosting plan.

## Data and scaling notes

Room state is held in memory. Restarting the Node.js process clears active rooms, scores, and matches.

For multi-instance scaling, add:

- Redis or another shared pub/sub layer
- Sticky WebSocket sessions or a WebSocket-aware gateway
- A persistent database for accounts and progression
- A matchmaking service

## Domain configuration

The canonical URLs and social metadata use:

```text
https://relicrush.io/
https://relicrush.io/play.html
https://relicrush.io/og-card.svg
```

Domain availability is unverified. Confirm and register `relicrush.io` with a registrar before configuring DNS.

## Deploy with Render

Use the one-click blueprint link for this repository:

https://render.com/deploy?repo=https://github.com/caytec/relicrush-io

Render requires you to sign in and click **Apply**. The free service may sleep when idle.
