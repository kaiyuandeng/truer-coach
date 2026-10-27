# RehabLoop

A TrueCoach-style app for a physical therapist and their clients. The client opens it, sees the workout the coach loaded for today, marks exercises done (with an optional note, pain score, photo or video), comments, and gets confetti at the end. The coach builds weeks on a drag-and-drop board, keeps saved workouts and multi-week programs, tracks clients in a small CRM, and replies to comments from an inbox.

Web app and installable PWA. Cloudflare Workers + D1 + KV, all on the free plan.

## Demo

With `DEMO_MODE` set to `"true"`, these links sign you in to seeded sample data (rebuilt each day so "today" lines up):

- `/demo/coach`: the coach, Evan
- `/demo/client/1`: the client, Kai (2 to 5 are other clients)
- `/demo/reset`: rebuild the sample data now
- `/store/demo-coach`: Evan's public course store (open it signed out to try guest checkout)

## Course store

Coaches turn any program into a course with a title, pitch, price and cover (Store tab). Clients buy courses from the Courses tab; anyone else can buy from the coach's store link, which signs them up as a client. Checkout is simulated: no card is charged, and `4000 0000 0000 0002` shows a decline. After buying, the client picks a start date and training days and the program's workouts go on their calendar.

## Onboarding pipeline

Clients → Onboarding tracks leads through Evan's process: a 15 minute pitch call, a 1 hour needs call, then the decision. The funnel at the top shows how many leads from the last 90 days made it through each call and signed up. Leads come in by hand, from a CRM, or from a pasted CSV.

CRM ingest lives in `worker/crm.ts`. Each adapter returns raw records from one CRM, `normalizeLead` (`worker/pipeline-logic.ts`) maps common field and stage names onto the pipeline, and re-imports update the same people instead of duplicating them. "Sample CRM" is a mock with seeded leads; HubSpot, GoHighLevel and Pipedrive are listed but not connected. To connect one, give its adapter a real `fetchLeads` with an API key from a Worker secret, or post `{ provider, leads: [...] }` to `POST /api/pipeline/ingest` (it takes the coach's session today, so a CRM webhook or Zapier would also need a per-coach API key).

## Develop

```sh
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787
npm test               # pipeline rules
```

## Deploy

Needs a Cloudflare API token with Workers, D1 and KV edit rights in `CLOUDFLARE_API_TOKEN` (or `npx wrangler login`).

```sh
npm install
npm run deploy         # builds, applies D1 migrations, deploys the Worker
```

The D1 database (`pt-coach`) and KV namespace (`pt-coach-media`) already exist; their ids are in `wrangler.jsonc`.

Photos and videos go to KV (up to 95 MB per file, stored in 20 MB chunks). R2 is used instead when an R2 bucket is bound as `MEDIA`, which needs a card on file.

## Demo build (no backend)

`npm run build:demo` writes `demo/dist/index.html`, one self-contained file with the whole app. The real worker runs inside the page on SQLite compiled to WebAssembly (sql.js) with the same migrations and seeded demo data as `/demo/coach`, so every screen and every change works with no server. A bar at the top switches between the coach view and each demo client, and "Reset data" reseeds. Uploads are kept in memory, and everything resets when the page reloads.
