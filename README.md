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

## Develop

```sh
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

## Deploy

Needs a Cloudflare API token with Workers, D1 and KV edit rights in `CLOUDFLARE_API_TOKEN` (or `npx wrangler login`).

```sh
npm install
npm run deploy         # builds, applies D1 migrations, deploys the Worker
```

The D1 database (`pt-coach`) and KV namespace (`pt-coach-media`) already exist; their ids are in `wrangler.jsonc`.

Photos and videos go to KV (up to 95 MB per file, stored in 20 MB chunks). R2 is used instead when an R2 bucket is bound as `MEDIA`, which needs a card on file.
