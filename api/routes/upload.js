// api/routes/upload.js — reusable single-image uploader.
// Saves original + a thumbnail (max 800px) to /public/uploads/.
// Returns { url, thumb_url }. Local disk for now; swap to DO Spaces
// later by changing only the storage/write logic below.

const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../auth');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// POST /api/upload — field name "image". Optional query ?thumb=true (default true).
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });

  try {
    // Everything except GIF becomes WebP. WebP supports alpha, so there's
    // no reason to preserve PNG — a 1600px photographic PNG runs 3-5MB,
    // the same image as WebP q82 is ~150-250KB. GIFs pass through untouched
    // (sharp doesn't animate-safe resize well).
    const isGif = req.file.mimetype === 'image/gif';
    const ext = isGif ? 'gif' : 'webp';
    const id = crypto.randomBytes(8).toString('hex');
    const filename = `${id}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    if (isGif) {
      fs.writeFileSync(filepath, req.file.buffer);
    } else {
      await sharp(req.file.buffer)
        .rotate() // respect EXIF orientation
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(filepath);
    }

    const makeThumb = req.query.thumb !== 'false';
    let thumbUrl = null;
    if (makeThumb && !isGif) {
      const thumbFilename = `${id}-thumb.${ext}`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      await sharp(req.file.buffer)
        .rotate()
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 78 })
        .toFile(thumbPath);
      thumbUrl = `/uploads/${thumbFilename}`;
    }

    res.json({
      url: `/uploads/${filename}`,
      thumb_url: thumbUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
