# Spark Radio

**Your station. Composed while you listen.**

An AI radio app: press play and music starts instantly from a library of
AI-generated tracks, while new tracks are composed for your station in the
background (via the Suno API). Liking, skipping, and finishing tracks teaches
each station your taste.

## How it works

Listening and generating run on **two separate clocks**:

| Lane | What | Where |
|------|------|-------|
| Listen (instant) | `next_track()` RPC picks the best ready track for your dial position + taste | Postgres |
| Taste (per action) | `record_feedback()` RPC logs like/skip/complete/dislike and nudges the station's taste vector | Postgres |
| Supply (background) | `commission_track()` RPC inserts a `generating` song aimed at your taste; pg_cron workers create + finish the Suno task | Postgres + Edge Functions |

Key properties:

- **No waiting**: nobody ever blocks on generation. Time-to-first-sound is one RPC call.
- **No auth wall**: anonymous users can listen and steer. Signing in is the *save point* —
  it unlocks stations that remember taste and commission fresh tracks.
- **Server-side selection**: track picking, taste math, and rate limits all live in
  SECURITY DEFINER Postgres functions — the client can't cheat them.
- **Every track has a story**: the UI explains why each track was picked
  (taste match, commissioned for your station, holiday special, …).

## Stack

Vite + React 18 + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres, Auth,
Edge Functions, pg_cron), Suno API for music generation.

- `src/hooks/useRadio.tsx` — the radio engine (tune in, advance, feedback, steering, supply)
- `src/contexts/AudioContext.tsx` — single audio element, MediaSession, next-track preload
- `src/pages/RadioPage.tsx` — the whole player UI
- `supabase/migrations/*_spark_stations_taste_loop.sql` — stations, station_plays, taste, RPCs
- `supabase/functions/` — legacy generation + cron completion workers

## Development

```sh
npm i
cp .env.example .env   # fill in your Supabase project values
npm run dev
```

## Operations notes

- pg_cron calls `complete-pending-generations` every minute with the project anon key;
  it creates Suno tasks for commissioned songs (`status='generating'`, `suno_id IS NULL`)
  and finalizes finished ones. All edge functions require JWT verification.
- Commissioning guardrails (in `commission_track`): max 2 in-flight per station,
  4 global per 15 min, 10 per user per hour.
- `SUNO_API_KEY` lives in Supabase function secrets.

This project was originally scaffolded with [Lovable](https://lovable.dev/projects/a3e168f8-40c9-4243-841b-80ad45ef9489).
