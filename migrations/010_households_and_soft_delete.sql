-- ===========================================================
-- 010_households_and_soft_delete.sql
-- Households: a group of users who share trip visibility.
-- Soft delete on trips so accidental deletes go to graveyard.
-- ===========================================================

CREATE TABLE IF NOT EXISTS households (
  id SERIAL PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS household_id INTEGER REFERENCES households(id);

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS trips_deleted_idx ON trips(deleted_at);
CREATE INDEX IF NOT EXISTS users_household_idx ON users(household_id);

-- Permanent fix for the recurring GRANT issue.
-- This makes future tables auto-grantable to lola_user without manual chasing.
GRANT ALL ON ALL TABLES IN SCHEMA public TO lola_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO lola_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lola_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO lola_user;
