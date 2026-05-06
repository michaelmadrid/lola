-- ===========================================================
-- 008_seed_monocle_cities.sql
-- Seeds the cities table with the 23 cities from
-- Monocle's city guides. Idempotent — uses ON CONFLICT
-- on slug to skip cities that already exist.
-- ===========================================================

INSERT INTO cities (name, slug, country) VALUES
  ('Athens',      'athens',      'Greece'),
  ('Bangkok',     'bangkok',     'Thailand'),
  ('Barcelona',   'barcelona',   'Spain'),
  ('Berlin',      'berlin',      'Germany'),
  ('Copenhagen',  'copenhagen',  'Denmark'),
  ('Hong Kong',   'hong-kong',   'China'),
  ('Istanbul',    'istanbul',    'Turkey'),
  ('Jakarta',     'jakarta',     'Indonesia'),
  ('Kyoto',       'kyoto',       'Japan'),
  ('Lisbon',      'lisbon',      'Portugal'),
  ('London',      'london',      'United Kingdom'),
  ('Madrid',      'madrid',      'Spain'),
  ('Melbourne',   'melbourne',   'Australia'),
  ('Mexico City', 'mexico-city', 'Mexico'),
  ('Milan',       'milan',       'Italy'),
  ('New York',    'new-york',    'United States'),
  ('Palma',       'palma',       'Spain'),
  ('Paris',       'paris',       'France'),
  ('Rome',        'rome',        'Italy'),
  ('Singapore',   'singapore',   'Singapore'),
  ('Sydney',      'sydney',      'Australia'),
  ('Tokyo',       'tokyo',       'Japan'),
  ('Venice',      'venice',      'Italy')
ON CONFLICT ON CONSTRAINT cities_name_key DO NOTHING;

-- Verify count
-- SELECT COUNT(*) FROM cities;
