# Migrations

SQL files that change the database schema. Numbered, run in order.

## Running migrations on the droplet

SSH into the droplet, then for each migration file:

```bash
sudo -u postgres psql -d lola -f /var/www/app.summer-holiday.com/migrations/001_extend_cities.sql
```

Run them in numerical order. Each is idempotent where possible (uses `IF NOT EXISTS` etc.) but should still only be run once.

## Order to run (Phase 0)

1. `001_extend_cities.sql` — renames `city_metadata` → `cities`, adds columns
2. `002_places.sql` — creates the Index `places` table
3. `003_trips_v05.sql` — adds date_start, date_end, slug, notes to trips
4. `004_trip_segments.sql` — creates `trip_segments` table
5. `005_notes.sql` — creates unified `notes` table
6. `006_saves.sql` — creates `saves` (capture) table
7. `007_user_roles.sql` — adds `role` column to users

## After running them

Verify by listing tables:

```bash
sudo -u postgres psql -d lola -c "\dt"
```

You should see: `cities`, `places`, `trip_segments`, `notes`, `saves` plus the existing tables (`users`, `trips`, `trip_members`, `trip_days`, `travel_legs`, `journal`, `city_links`, `city_notes`).

The old tables stay so v0.3 data is preserved. They're unused by v0.5 code.

## Set yourself as admin (optional, for later)

After running 007:

```bash
sudo -u postgres psql -d lola -c "UPDATE users SET role = 'admin' WHERE email = 'your@email';"
```

## Rolling back

Right now there's no automated rollback. If something goes wrong:

- For new tables (places, trip_segments, notes, saves): `DROP TABLE IF EXISTS <name>;`
- For column additions: `ALTER TABLE <table> DROP COLUMN <col>;`
- For the `cities` rename in 001: more involved; backup before running

Recommend taking a backup before running 001 since it renames a table:

```bash
sudo -u postgres pg_dump lola > ~/lola-backup-$(date +%Y%m%d).sql
```
