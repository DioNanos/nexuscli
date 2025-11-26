const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getApiKey } = require('../db/adapter');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max (Whisper limit)
});

/**
 * POST /api/v1/speech/transcribe
 * Transcribe audio using OpenAI Whisper API
 * Body: multipart/form-data with 'audio' file and 'language' (optional)
 * Returns: { text: string }
 *
 * Supported languages (aligned with UI): it, en, es, ja, ru, zh
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const apiKey = getApiKey('openai');
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Build FormData using native Node.js 22+ FormData and File
    const formData = new FormData();
    const audioFile = new File([req.file.buffer], 'audio.webm', {
      type: req.file.mimetype || 'audio/webm'
    });
    formData.append('file', audioFile);
    formData.append('model', 'whisper-1');

    // Use language from request - extract base language (it-IT -> it)
    if (req.body.language) {
      const lang = req.body.language.split('-')[0]; // it-IT -> it
      formData.append('language', lang);
    }

    console.log('[Speech] Transcribing audio:', {
      size: req.file.size,
      mimetype: req.file.mimetype,
      language: req.body.language || 'auto-detect'
    });

    // Use native fetch (Node.js 22+)
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[Speech] OpenAI error:', error);
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    console.log('[Speech] Transcription success:', data.text?.substring(0, 50) + '...');
    res.json(data);

  } catch (error) {
    console.error('[Speech] Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
