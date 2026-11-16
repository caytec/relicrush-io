# RelicRush.io

Relic Rush is a real-time multiplayer top-down temple adventure game.

## Routes

- `/` — branded landing page.
- `/play.html` — game page.
- `/health` — JSON health check.

## Local development

```bash
npm install
npm start
```

## Render deployment

This repository includes a Render Blueprint in `render.yaml`.

Deploy with the one-click Render link in the project publication report. Render requires signing in and clicking **Apply**. The free service may sleep when idle.

Build command: `npm install`

Start command: `npm start`

Health check: `/health`

Environment: `NODE_ENV=production`
