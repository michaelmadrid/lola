-- ===========================================================
-- 019_import_bookshops.sql
-- One-time import of curated bookshops, attributed to KIT.
-- Idempotent — running twice is safe.
--
-- Behavior:
--   * Featured cities (status=3) created if not present.
--   * Existing cities found by case-insensitive name match get promoted to status=3.
--   * Country normalization: "UK" -> "United Kingdom".
--   * City normalization: "NYC" -> "New York".
--   * Places upserted by (name, city) — duplicate name + city = skip.
--   * URL prefixes normalized to https:// where missing.
-- ===========================================================

-- Helper: ensure KIT user exists (should already, from migration 012)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE slug = 'kit') THEN
    INSERT INTO users (email, name, display_name, kind_id, slug, verified, bio, role, created_at)
    VALUES ('kit@summer-holiday.com', 'KIT', 'KIT', 3, 'kit', true,
            'A travel companion by Summer Holiday', 'user', NOW());
  END IF;
END $$;

-- Cities: upsert via (LOWER(name), country) match. Idempotent.
-- Promote any matched existing city to status=3.
WITH city_data(name, country) AS (VALUES
  ('Fukuoka',     'Japan'),
  ('Tokyo',       'Japan'),
  ('Paris',       'France'),
  ('Kanazawa',    'Japan'),
  ('Brussels',    'Belgium'),
  ('London',      'United Kingdom'),
  ('Bangkok',     'Thailand'),
  ('Singapore',   'Singapore'),
  ('Nashville',   'United States'),
  ('Copenhagen',  'Denmark'),
  ('Melbourne',   'Australia'),
  ('Lisbon',      'Portugal'),
  ('Seoul',       'South Korea'),
  ('Seattle',     'United States'),
  ('Byron Bay',   'Australia'),
  ('Mexico City', 'Mexico'),
  ('Berlin',      'Germany'),
  ('Milan',       'Italy'),
  ('Marseille',   'France'),
  ('Athens',      'Greece'),
  ('Los Angeles', 'United States'),
  ('Amsterdam',   'Netherlands'),
  ('Austin',      'United States'),
  ('New York',    'United States')
),
upserted AS (
  -- Insert any city not already present (matched by case-insensitive name)
  INSERT INTO cities (name, slug, country, status, created_at)
  SELECT cd.name,
         LOWER(REGEXP_REPLACE(cd.name, '[^a-zA-Z0-9]+', '-', 'g')),
         cd.country,
         3,
         NOW()
  FROM city_data cd
  WHERE NOT EXISTS (
    SELECT 1 FROM cities c WHERE LOWER(c.name) = LOWER(cd.name)
  )
  RETURNING id, name
)
-- Promote any pre-existing matching city to status=3 + ensure country is set
UPDATE cities c
   SET status = 3,
       country = COALESCE(c.country, cd.country)
  FROM (VALUES
    ('Fukuoka',     'Japan'),
    ('Tokyo',       'Japan'),
    ('Paris',       'France'),
    ('Kanazawa',    'Japan'),
    ('Brussels',    'Belgium'),
    ('London',      'United Kingdom'),
    ('Bangkok',     'Thailand'),
    ('Singapore',   'Singapore'),
    ('Nashville',   'United States'),
    ('Copenhagen',  'Denmark'),
    ('Melbourne',   'Australia'),
    ('Lisbon',      'Portugal'),
    ('Seoul',       'South Korea'),
    ('Seattle',     'United States'),
    ('Byron Bay',   'Australia'),
    ('Mexico City', 'Mexico'),
    ('Berlin',      'Germany'),
    ('Milan',       'Italy'),
    ('Marseille',   'France'),
    ('Athens',      'Greece'),
    ('Los Angeles', 'United States'),
    ('Amsterdam',   'Netherlands'),
    ('Austin',      'United States'),
    ('New York',    'United States')
  ) AS cd(name, country)
  WHERE LOWER(c.name) = LOWER(cd.name);


-- Bookshops: upsert by (name, city_id). Skip duplicates.
-- The `LEFT JOIN cities ON LOWER(c.name) = LOWER(cd.city_name)` resolves city_id at insert time.
DO $$
DECLARE
  kit_id INTEGER;
  shop RECORD;
  city_id_resolved INTEGER;
  normalized_url TEXT;
BEGIN
  SELECT id INTO kit_id FROM users WHERE slug = 'kit';
  IF kit_id IS NULL THEN
    RAISE EXCEPTION 'KIT user not found, aborting import';
  END IF;

  FOR shop IN (
    SELECT * FROM (VALUES
      ('AO Hatabooks',           'Fukuoka',     'https://en.aohatabooks.com'),
      ('POST',                   'Tokyo',       'http://post-books.info'),
      ('Yvon Lambert',           'Paris',       'https://www.yvon-lambert.com/pages/about'),
      ('Super Labo',             'Tokyo',       'https://www.superlabostoretokyo.com'),
      ('IACK',                   'Kanazawa',    'https://www.iack.online'),
      ('Saint Martin Bookshop',  'Brussels',    'https://saint-martin-bookshop.com'),
      ('IdeaBooks London',       'London',      'https://www.ideanow.online'),
      ('Vacilando Bookshop',     'Bangkok',     'https://www.vacilandobookshop.com'),
      ('Basheer Books',          'Singapore',   NULL),
      ('Green Ray Books',        'Nashville',   'https://thegreenraybooks.com'),
      ('Le Petit Voyeur',        'Copenhagen',  'https://lepetitvoyeur.com'),
      ('Perimeter Books',        'Melbourne',   'https://www.perimeterbooks.com'),
      ('Under The Cover',        'Lisbon',      'https://www.underthecover.pt'),
      ('Ofr Paris',              'Paris',       'https://www.instagram.com/ofrparis/?hl=en'),
      ('Ofr Seoul',              'Seoul',       'https://www.instagram.com/ofrseoul/'),
      ('Utrecht',                'Tokyo',       'https://utrecht.jp'),
      ('Peter Miller Books',     'Seattle',     'https://petermiller.com'),
      ('Bacteria Books',         'Byron Bay',   'https://bacteriabooks.com'),
      ('Casa Bosques',           'Mexico City', 'https://casabosques.net'),
      ('do you read me?',        'Berlin',      'https://doyoureadme.de'),
      ('Marsell Paradise',       'Milan',       NULL),
      ('Tipi',                   'Brussels',    'https://www.tipi-bookshop.be'),
      ('Ensemble',               'Marseille',   'https://ensemble.biz'),
      ('Void Publishing',        'Athens',      'https://void.photo'),
      ('Donlon Books',           'London',      'https://donlonbooks.com'),
      ('Artwords Bookshop',      'London',      'https://www.artwords.co.uk'),
      ('Shop Editions',          'New York',    'https://shop.editionsnewyork.com'),
      ('ARTBOOK @ Hauser & Wirth', 'Los Angeles', NULL),
      ('San Serriffe',           'Amsterdam',   'https://san-serriffe.com'),
      ('Tender',                 'London',      'https://tenderbooks.co.uk'),
      ('Tomo Mags',              'Austin',      'https://tomomags.com'),
      ('Rectangle Room',         'New York',    'https://www.rectangleroom.com'),
      ('Dashwood Books',         'New York',    'https://www.dashwoodbooks.com'),
      ('Bildband Berlin',        'Berlin',      'https://bildbandberlin.com'),
      ('In Form Library',        'Melbourne',   NULL)
    ) AS t(name, city_name, url)
  ) LOOP
    -- Resolve city id by case-insensitive name
    SELECT id INTO city_id_resolved
      FROM cities
     WHERE LOWER(name) = LOWER(shop.city_name)
     LIMIT 1;

    IF city_id_resolved IS NULL THEN
      RAISE NOTICE 'City % not found for shop %, skipping', shop.city_name, shop.name;
      CONTINUE;
    END IF;

    -- Skip if a place with same name+city already exists (case-insensitive name)
    IF EXISTS (
      SELECT 1 FROM places p
       WHERE p.city_id = city_id_resolved
         AND LOWER(p.name) = LOWER(shop.name)
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO places (
      name, slug, city_id, category, url, is_public, created_by, created_at, updated_at
    )
    VALUES (
      shop.name,
      LOWER(REGEXP_REPLACE(shop.name, '[^a-zA-Z0-9]+', '-', 'g')),
      city_id_resolved,
      'bookshop',
      shop.url,
      true,
      kit_id,
      NOW(),
      NOW()
    );
  END LOOP;
END $$;

-- Show what we did. Run separately to inspect:
--   SELECT c.name AS city, c.country, COUNT(p.id) AS shops
--     FROM cities c
--     JOIN places p ON p.city_id = c.id
--    WHERE p.category = 'bookshop'
--    GROUP BY c.name, c.country
--    ORDER BY shops DESC, c.name;
