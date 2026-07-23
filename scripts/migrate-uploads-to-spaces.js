#!/usr/bin/env node
// scripts/migrate-uploads-to-spaces.js
//
// One-off: copies everything in public/uploads/ up to DigitalOcean
// Spaces, then rewrites the DB columns that reference "/uploads/..."
// to the new absolute CDN URLs.
//
//   node scripts/migrate-uploads-to-spaces.js --dry-run   (report only)
//   node scripts/migrate-uploads-to-spaces.js             (do it)
//
// Safe to re-run: uploads overwrite by key, and the SQL only rewrites
// rows still pointing at /uploads/. Local files are left in place, so
// nothing breaks if you need to roll back — just revert the DB.
//
// Requires the same SPACES_* env vars as api/routes/upload.js.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../api/db'); // reuse the app's pool so DB config can't drift

const DRY = process.argv.includes('--dry-run');

const CFG = {
  key:        process.env.SPACES_KEY,
  secret:     process.env.SPACES_SECRET,
  region:     process.env.SPACES_REGION || 'sgp1',
  bucket:     process.env.SPACES_BUCKET,
  endpoint:   process.env.SPACES_ENDPOINT,
  publicBase: process.env.SPACES_PUBLIC_BASE,
  prefix:     process.env.SPACES_PREFIX || 'uploads',
};

for (const k of ['key', 'secret', 'bucket', 'endpoint', 'publicBase']) {
  if (!CFG[k]) {
    console.error(`Missing SPACES config: ${k}. Check your .env.`);
    process.exit(1);
  }
}

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const TYPES = {
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
};

// Columns holding "/uploads/..." paths.
const COLUMNS = [
  { table: 'spots',       column: 'image_url' },
  { table: 'board_notes', column: 'image_url' },
  { table: 'boards',      column: 'background_image' },
];

const s3 = new S3Client({
  region: CFG.region,
  endpoint: CFG.endpoint,
  credentials: { accessKeyId: CFG.key, secretAccessKey: CFG.secret },
});

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`No upload dir at ${UPLOAD_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(f => TYPES[path.extname(f).toLowerCase()]);

  console.log(`${DRY ? '[DRY RUN] ' : ''}Found ${files.length} file(s) in ${UPLOAD_DIR}`);
  console.log(`Target: ${CFG.publicBase}/${CFG.prefix}/\n`);

  // 1 — upload files
  let uploaded = 0, failed = 0;
  for (const file of files) {
    const key = `${CFG.prefix}/${file}`;
    if (DRY) { console.log(`  would upload ${file} → ${key}`); uploaded++; continue; }
    try {
      await s3.send(new PutObjectCommand({
        Bucket: CFG.bucket,
        Key: key,
        Body: fs.readFileSync(path.join(UPLOAD_DIR, file)),
        ACL: 'public-read',
        ContentType: TYPES[path.extname(file).toLowerCase()],
        CacheControl: CACHE_CONTROL,
      }));
      uploaded++;
      process.stdout.write('.');
    } catch (err) {
      failed++;
      console.error(`\n  FAILED ${file}: ${err.message}`);
    }
  }
  console.log(`\n\nUploaded ${uploaded}, failed ${failed}\n`);
  if (failed && !DRY) {
    console.error('Some uploads failed — NOT rewriting the DB. Fix and re-run.');
    process.exit(1);
  }

  // 2 — rewrite DB references
  const newBase = `${CFG.publicBase}/${CFG.prefix}/`;
  for (const { table, column } of COLUMNS) {
    const countSql = `SELECT COUNT(*) FROM ${table} WHERE ${column} LIKE '/uploads/%'`;
    const { rows } = await pool.query(countSql);
    const n = parseInt(rows[0].count, 10);
    if (!n) { console.log(`${table}.${column}: nothing to rewrite`); continue; }

    if (DRY) { console.log(`${table}.${column}: would rewrite ${n} row(s)`); continue; }

    const res = await pool.query(
      `UPDATE ${table}
       SET ${column} = $1 || substring(${column} from 10)
       WHERE ${column} LIKE '/uploads/%'`,
      [newBase]
    );
    console.log(`${table}.${column}: rewrote ${res.rowCount} row(s)`);
  }

  console.log(DRY ? '\n[DRY RUN] nothing changed.' : '\nDone.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
