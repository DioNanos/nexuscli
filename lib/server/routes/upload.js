const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Termux-only: attachments in ~/.nexuscli/attachments
const ATTACHMENTS_DIR = path.join(process.env.HOME, '.nexuscli', 'attachments');

// Ensure directory exists
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  console.log(`[Upload] Created attachments directory: ${ATTACHMENTS_DIR}`);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    // Unique filename: timestamp_originalname
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});

// File filter - allow images and documents
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
    'application/json', 'application/xml', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Code files (often sent as octet-stream)
    'application/octet-stream', 'text/x-python', 'text/javascript', 'application/javascript'
  ];

  // Also allow by extension for code files
  const allowedExts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.rb', '.php', '.go', '.rs', '.sh', '.bash', '.zsh', '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.css', '.sql', '.log'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype} (${ext})`), false);
  }
};

// Multer config - 50MB limit
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// POST /api/v1/upload - Single file upload
router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    const originalName = req.file.originalname;
    const mimeType = req.file.mimetype;
    const size = req.file.size;

    console.log(`[Upload] File saved: ${filePath} (${size} bytes, ${mimeType})`);

    res.json({
      success: true,
      file: {
        path: filePath,
        name: fileName,
        originalName,
        mimeType,
        size
      }
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/upload/multiple - Multiple files upload
router.post('/multiple', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map(f => ({
      path: f.path,
      name: f.filename,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size
    }));

    console.log(`[Upload] ${files.length} files saved`);

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('[Upload] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handler for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 50MB)' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

module.exports = router;
