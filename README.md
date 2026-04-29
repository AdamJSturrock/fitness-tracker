# Fitness Tracker

## What it is

A two-person, self-hosted replacement for MyFitnessPal, scoped to Adam and
Anna. Daily weight + steps + calories check-in, a shared food library, and
a dashboard whose centrepiece is a smoothed weight chart with a max-healthy-
loss reference line, target-weight band, and a forward projection once
enough data exists. Single shared password; pick "Adam" or "Anna" after
logging in.

## Local dev

```bash
pnpm install
cp .env.local.example .env.local
# edit .env.local and set:
#   APP_PASSWORD=<your password>
#   COOKIE_SECRET=<32+ random characters>
#   TURSO_DATABASE_URL=file:./local.db   # already the default
pnpm migrate            # creates tables, seeds adam + anna
pnpm dev                # http://localhost:3000
```

Visit `/`, log in with `APP_PASSWORD`, then go to `/adam/profile` to fill in
height, age, start weight, and target band. After that, `/adam/today` is
the daily check-in screen and `/adam/dashboard` is the chart.

## Optional: seed fake data

For exploring the UI with a populated dashboard before you've logged any
real entries:

```bash
pnpm seed:fake
```

This is idempotent and produces 30 days of fixtures: weight entries
trending 200 → 192 lb (Adam) and 160 → 156 lb (Anna), about 8 shared foods,
and a few meal items per day per user.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Recharts for the chart composition (raw scatter + smoothed line +
  reference line + target band + projection)
- Turso / libSQL via `@libsql/client`
- `iron-session` for the signed cookie
- Zod for action input validation
- `date-fns` for date math
- Vitest for unit tests

## Deploying to Vercel

1. Create a Turso database (`turso db create fitness-tracker`) and copy its
   URL + auth token.
2. Push the repo to GitHub and import it into Vercel (or link it with
   `vercel link`).
3. Set these environment variables on the Vercel project (Settings →
   Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://<your-db>.turso.io` |
   | `TURSO_AUTH_TOKEN` | The token from `turso db tokens create` |
   | `APP_PASSWORD` | Whatever shared password Adam + Anna will use |
   | `COOKIE_SECRET` | At least 32 random characters |

4. Run the schema migration once against the production Turso DB. From
   your laptop:

   ```bash
   TURSO_DATABASE_URL=libsql://<your-db>.turso.io \
   TURSO_AUTH_TOKEN=<token> \
     pnpm tsx scripts/migrate.ts
   ```

   This creates the four tables and seeds the `adam` + `anna` rows. It is
   idempotent — safe to re-run.
5. Deploy: `vercel --prod`, or just `git push` to the linked branch.

After the first deploy, log in once on a phone, fill in profiles for both
users on `/adam/profile` and `/anna/profile`, and you're set.

## How to use it

Log in with the shared password, then use the toggle at the top to switch
between Adam and Anna. Go to **Today** to log weight + steps and add foods
from the shared library (or add a new food inline). The **Dashboard** shows
the smoothed weight curve, a max-healthy-loss reference line, your target
band, and a forward projection that appears once you've logged at least
7 days of weight.

## Adding new shared foods

Use the **Foods** tab. Adam and Anna share one library — anything either
person adds is visible to the other immediately. Edit calorie counts or
serving labels in place; archive things you no longer buy (they stay
linked to old meal items, but disappear from the picker). Toggle "Show
archived" to bring an item back via the Unarchive button.

## Troubleshooting

- **`COOKIE_SECRET env var must be set to a string of at least 32 characters in production.`** — set `COOKIE_SECRET` to something with ≥32 characters.
- **`Server is not configured (APP_PASSWORD missing).` 500 on login** — set `APP_PASSWORD` in `.env.local` (or in Vercel) and restart.
- **Empty dashboard / "Log your first weight"** — you have no `entries` rows for that user. Either log a weight on the Today tab, or run `pnpm seed:fake` to populate fixtures.
- **Profile fields all blank** — run `pnpm migrate` once to create the `adam` + `anna` rows, then fill them in on `/[user]/profile`.
- **Local DB looks stale after a schema change** — delete `local.db` (and its `-wal` / `-shm` siblings) and re-run `pnpm migrate`.
