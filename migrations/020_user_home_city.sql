-- ===========================================================
-- 020_user_home_city.sql
-- Adds users.home_city_id (FK to cities). Backfills timezones for
-- the cities the user can pick as a home location.
-- ===========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_home_city_id_idx ON users(home_city_id);

-- Backfill timezones for known cities. Idempotent.
-- Use a CASE expression so each city updates only if its tz is null.
UPDATE cities SET timezone = CASE LOWER(name)
  -- SE Asia / Asia
  WHEN 'bali'        THEN 'Asia/Makassar'
  WHEN 'jakarta'     THEN 'Asia/Jakarta'
  WHEN 'bandung'     THEN 'Asia/Jakarta'
  WHEN 'singapore'   THEN 'Asia/Singapore'
  WHEN 'bangkok'     THEN 'Asia/Bangkok'
  WHEN 'tokyo'       THEN 'Asia/Tokyo'
  WHEN 'fukuoka'     THEN 'Asia/Tokyo'
  WHEN 'kanazawa'    THEN 'Asia/Tokyo'
  WHEN 'seoul'       THEN 'Asia/Seoul'
  WHEN 'hong kong'   THEN 'Asia/Hong_Kong'
  WHEN 'taipei'      THEN 'Asia/Taipei'
  WHEN 'shanghai'    THEN 'Asia/Shanghai'
  WHEN 'beijing'     THEN 'Asia/Shanghai'
  -- Europe
  WHEN 'london'      THEN 'Europe/London'
  WHEN 'paris'       THEN 'Europe/Paris'
  WHEN 'berlin'      THEN 'Europe/Berlin'
  WHEN 'rome'        THEN 'Europe/Rome'
  WHEN 'milan'       THEN 'Europe/Rome'
  WHEN 'lisbon'      THEN 'Europe/Lisbon'
  WHEN 'porto'       THEN 'Europe/Lisbon'
  WHEN 'madrid'      THEN 'Europe/Madrid'
  WHEN 'barcelona'   THEN 'Europe/Madrid'
  WHEN 'amsterdam'   THEN 'Europe/Amsterdam'
  WHEN 'brussels'    THEN 'Europe/Brussels'
  WHEN 'copenhagen'  THEN 'Europe/Copenhagen'
  WHEN 'stockholm'   THEN 'Europe/Stockholm'
  WHEN 'oslo'        THEN 'Europe/Oslo'
  WHEN 'helsinki'    THEN 'Europe/Helsinki'
  WHEN 'athens'      THEN 'Europe/Athens'
  WHEN 'istanbul'    THEN 'Europe/Istanbul'
  WHEN 'dublin'      THEN 'Europe/Dublin'
  WHEN 'marseille'   THEN 'Europe/Paris'
  WHEN 'zurich'      THEN 'Europe/Zurich'
  -- Americas
  WHEN 'new york'    THEN 'America/New_York'
  WHEN 'nyc'         THEN 'America/New_York'
  WHEN 'los angeles' THEN 'America/Los_Angeles'
  WHEN 'san francisco' THEN 'America/Los_Angeles'
  WHEN 'seattle'     THEN 'America/Los_Angeles'
  WHEN 'chicago'     THEN 'America/Chicago'
  WHEN 'austin'      THEN 'America/Chicago'
  WHEN 'nashville'   THEN 'America/Chicago'
  WHEN 'mexico city' THEN 'America/Mexico_City'
  WHEN 'toronto'     THEN 'America/Toronto'
  WHEN 'vancouver'   THEN 'America/Vancouver'
  WHEN 'sao paulo'   THEN 'America/Sao_Paulo'
  WHEN 'rio de janeiro' THEN 'America/Sao_Paulo'
  WHEN 'buenos aires' THEN 'America/Argentina/Buenos_Aires'
  -- Oceania
  WHEN 'sydney'      THEN 'Australia/Sydney'
  WHEN 'melbourne'   THEN 'Australia/Melbourne'
  WHEN 'byron bay'   THEN 'Australia/Sydney'
  WHEN 'auckland'    THEN 'Pacific/Auckland'
  -- Middle East / Africa
  WHEN 'dubai'       THEN 'Asia/Dubai'
  WHEN 'cape town'   THEN 'Africa/Johannesburg'
  WHEN 'cairo'       THEN 'Africa/Cairo'
  WHEN 'tel aviv'    THEN 'Asia/Tel_Aviv'
  ELSE timezone
END
WHERE timezone IS NULL OR timezone = '';
