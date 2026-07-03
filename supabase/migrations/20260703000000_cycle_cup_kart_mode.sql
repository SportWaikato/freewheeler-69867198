-- ─────────────────────────────────────────────────────────────────────────────
-- 20260703000000_cycle_cup_kart_mode.sql
-- Cycle Cup (kart-racing rebuild) schema extensions.
--
-- Deliberately additive: game_race_rooms / game_race_results / game_rides and
-- the award_game_ride_points() trigger keep working exactly as before. Kart
-- races store their track id in route_id (ids are namespaced by the track
-- registry, e.g. 'meadow-grand-prix') so all existing indexes and the shared
-- student_points flow apply unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow the new ride source
alter table public.game_rides
  drop constraint if exists game_rides_source_check;
alter table public.game_rides
  add constraint game_rides_source_check
  check (source in ('game', 'simulator', 'wattbike', 'cycle_cup'));

-- 2. Kart-mode room metadata
alter table public.game_race_rooms
  add column if not exists laps integer not null default 3,
  add column if not exists game_mode text not null default 'route'
    check (game_mode in ('route', 'cycle_cup'));

-- 3. Richer per-racer results (best lap for future track leaderboards)
alter table public.game_race_results
  add column if not exists best_lap_seconds integer,
  add column if not exists distance_km numeric(8,3),
  add column if not exists avg_power_watts integer;

create index if not exists idx_game_race_results_best_lap
  on public.game_race_results (route_id, best_lap_seconds)
  where best_lap_seconds is not null;
