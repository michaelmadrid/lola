// api/routes/upload.js — reusable single-image uploader.
//
// Resizes to max 1600px and converts to WebP (q82), plus a 400px thumb.
// WebP supports alpha, so nothing needs to stay PNG — a 1600px
// photographic PNG runs 3-5MB where the same image as WebP is ~200KB.
// GIFs pass through untouched (sharp can't animate-safe resize).
//
// STORAGE: uploads go to DigitalOcean Spaces when the SPACES_* env vars
// are present, otherwise they fall back to local disk (/public/uploads).
// The fallback means a missing/incorrect config degrades to the old
// behaviour instead of breaking uploads outright.
//
// Existing images keep working either way — they're stored in the DB as
// relative "/uploads/..." paths and still served by nginx. Only new
// uploads get absolute CDN URLs. The frontend's imgSrc() helper already
// handles both shapes (absolute passes through, relative gets prefixed).

const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Spaces config ────────────────────────────────────────────────
// SPACES_PUBLIC_BASE is the full base URL objects are served from —
// the CDN hostname if the CDN is enabled, otherwise the origin. Being
// explicit avoids guessing at URL shapes.
const SPACES = {
  key:        process.env.SPACES_KEY,
  secret:     process.env.SPACES_SECRET,
  region:     process.env.SPACES_REGION || 'sgp1',
  bucket:     process.env.SPACES_BUCKET,
  endpoint:   process.env.SPACES_ENDPOINT,     // e.g. https://sgp1.digitaloceanspaces.com
  publicBase: process.env.SPACES_PUBLIC_BASE,  // e.g. https://posto.sgp1.cdn.digitaloceanspaces.com
  prefix:     process.env.SPACES_PREFIX || 'uploads',
};

const useSpaces = !!(SPACES.key && SPACES.secret && SPACES.bucket &&
                     SPACES.endpoint && SPACES.publicBase);

let s3 = null;
if (useSpaces) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({
    region: SPACES.region,
    endpoint: SPACES.endpoint,
    credentials: {
      accessKeyId: SPACES.key,
      secretAccessKey: SPACES.secret,
    },
  });
  console.log(`[upload] Spaces enabled → ${SPACES.publicBase}/${SPACES.prefix}/`);
} else {
  console.log('[upload] Spaces not configured — using local disk');
}

// Filenames are random and never reused, so objects can be cached
// forever. That's the whole point of putting them behind a CDN.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

async function putToSpaces(filename, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `${SPACES.prefix}/${filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: SPACES.bucket,
    Key: key,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
    CacheControl: CACHE_CONTROL,
  }));
  return `${SPACES.publicBase}/${key}`;
}

// Writes a buffer and returns the URL to store in the DB.
async function store(filename, buffer, contentType) {
  if (useSpaces) return putToSpaces(filename, buffer, contentType);
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — cap is on the INPUT file; it gets resized + converted before storage
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// POST /api/upload — field name "image". Optional query ?thumb=false to skip the thumbnail.
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  try {
    const isGif = req.file.mimetype === 'image/gif';
    const ext = isGif ? 'gif' : 'webp';
    const contentType = isGif ? 'image/gif' : 'image/webp';
    const id = crypto.randomBytes(8).toString('hex');

    const mainBuf = isGif
      ? req.file.buffer
      : await sharp(req.file.buffer)
          .rotate() // respect EXIF orientation
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();

    const url = await store(`${id}.${ext}`, mainBuf, contentType);

    let thumbUrl = null;
    if (req.query.thumb !== 'false' && !isGif) {
      const thumbBuf = await sharp(req.file.buffer)
        .rotate()
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 78 })
        .toBuffer();
      thumbUrl = await store(`${id}-thumb.${ext}`, thumbBuf, contentType);
    }

    res.json({ url, thumb_url: thumbUrl });
  } catch (err) {
    console.error('[upload] failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
