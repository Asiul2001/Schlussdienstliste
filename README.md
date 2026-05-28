# Schlussdienstliste

Full-stack checklist app for restaurant closing shifts.

## Stack

- React frontend built with Create React App
- Express + Socket.IO backend
- MongoDB for persistence

## Local development

Install dependencies:

```bash
npm install
```

Create a local env file from `.env.example` and set a MongoDB connection string.

Build the frontend:

```bash
npm run build
```

Start the app:

```bash
npm start
```

The server serves the React build and exposes the API on the same origin.

## Production deployment

This app is not suitable for GitHub Pages because it needs:

- a Node.js server
- Socket.IO
- a MongoDB database

The repo includes [render.yaml](./render.yaml) for deploying to Render.

### Required environment variables

- `CLIENT_ORIGIN`
- `JWT_SECRET`
- `MONGODB_URI`
- `HOST`
- `PORT`

Use [.env.example](./.env.example) as the template.

### Render steps

1. Push this repo to GitHub.
2. Create a MongoDB Atlas database and copy its connection string into `MONGODB_URI`.
3. In Render, create a new Blueprint or Web Service from this repo.
4. Set `CLIENT_ORIGIN` to your final Render app URL.
5. Set `MONGODB_URI` to the Atlas connection string.
6. Deploy and confirm `GET /api/health` returns `{ "ok": true }`.

## Health check

The app exposes:

- `/api/health`

That endpoint returns a simple JSON payload for deployment health checks.
