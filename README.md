# Better Calendar Tasks (Website Only)

This folder is the web-only version for GitHub + Vercel deployment.

## Includes

- `client/` React app (calendar/tasks UI, workout removed)
- `server/` Express API
- `api/index.ts` Vercel serverless entrypoint
- Postgres auth + per-user storage (`server/webAuthDb.ts`)
- `vercel.json` for rewrites/build output

## Deploy to Vercel

1. Push this `website-only` folder contents to a new GitHub repo.
2. Import that repo in Vercel.
3. Set env vars:
   - `DATABASE_URL` (required)
   - `COOKIE_SECURE=1` (recommended in production)
4. Deploy.

## Local run

```bash
npm install
cd client && npm install && cd ..
npm run dev
```

Or production-style:

```bash
npm run build
npm run serve
```
