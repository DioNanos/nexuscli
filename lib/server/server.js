const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { initDb, prepare } = require('./db');
const User = require('./models/User');
const WorkspaceManager = require('./services/workspace-manager');
const sessionImporter = require('./services/session-importer');
const pkg = require('../../package.json');

// Import middleware
const { authMiddleware } = require('./middleware/auth');

// Import routes
const authRouter = require('./routes/auth');
const conversationsRouter = require('./routes/conversations');
const messagesRouter = require('./routes/messages');
const jobsRouter = require('./routes/jobs');
const chatRouter = require('./routes/chat');
const codexRouter = require('./routes/codex');
const geminiRouter = require('./routes/gemini');
const modelsRouter = require('./routes/models');
const workspaceRouter = require('./routes/workspace');
const workspacesRouter = require('./routes/workspaces');
const sessionsRouter = require('./routes/sessions');
const wakeLockRouter = require('./routes/wake-lock');
const uploadRouter = require('./routes/upload');
const keysRouter = require('./routes/keys');
const speechRouter = require('./routes/speech');
const configRouter = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 41800;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} (URL: ${req.url}, original: ${req.originalUrl})`);
  next();
});

// Health check (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nexuscli-backend',
    version: pkg.version,
    engines: ['claude', 'codex', 'gemini'],
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Serve frontend static files (production)
// Path: lib/server -> ../../frontend/dist
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// Public routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/models', modelsRouter);
app.use('/api/v1/config', configRouter);
app.use('/api/v1/workspace', workspaceRouter);
app.use('/api/v1', wakeLockRouter); // Wake lock endpoints (public for app visibility handling)
app.use('/api/v1/workspaces', authMiddleware, workspacesRouter);
app.use('/api/v1/sessions', authMiddleware, sessionsRouter);

// Protected routes (require authentication)
app.use('/api/v1/conversations', authMiddleware, conversationsRouter);
app.use('/api/v1/conversations', authMiddleware, messagesRouter);
app.use('/api/v1/jobs', authMiddleware, jobsRouter);
app.use('/api/v1/chat', authMiddleware, chatRouter);
app.use('/api/v1/codex', authMiddleware, codexRouter);
app.use('/api/v1/gemini', authMiddleware, geminiRouter);
app.use('/api/v1/upload', authMiddleware, uploadRouter); // File upload

// STT routes
app.use('/api/v1/keys', keysRouter); // Public - needed for STT provider detection
app.use('/api/v1/speech', authMiddleware, speechRouter); // Protected - Whisper proxy

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'NexusCLI Backend',
    version: pkg.version,
    engines: ['claude', 'codex', 'gemini'],
    endpoints: {
      health: '/health',
      models: '/api/v1/models',
      chat: '/api/v1/chat (Claude)',
      codex: '/api/v1/codex (OpenAI)',
      gemini: '/api/v1/gemini (Google)',
      conversations: '/api/v1/conversations',
      jobs: '/api/v1/jobs'
    }
  });
});

// SPA catch-all route (serve index.html for all non-API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// 404 handler (for API routes)
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
async function start() {
  // Initialize database first
  await initDb();

  // ⚡ SYNC DATABASE WITH FILESYSTEM (CRITICAL!)
  // Database is only a CACHE - real truth is on disk
  // Discover and index ALL workspaces from .claude/projects/
  console.log('[Startup] Discovering and syncing all workspaces...');
  const workspaceManager = new WorkspaceManager();
  try {
    const workspaces = await workspaceManager.discoverWorkspaces();
    console.log(`[Startup] Found ${workspaces.length} workspaces with sessions`);

    // Mount each workspace to index its sessions
    for (const ws of workspaces) {
      try {
        await workspaceManager.mountWorkspace(ws.workspace_path);
        console.log(`[Startup] ✅ Mounted ${ws.workspace_path} (${ws.session_count} sessions)`);
      } catch (error) {
        console.error(`[Startup] ⚠️  Failed to mount ${ws.workspace_path}:`, error.message);
      }
    }

    console.log('[Startup] ✅ All workspaces synced to database');
  } catch (error) {
    console.error('[Startup] ⚠️  Failed to discover workspaces:', error.message);
    // Continue anyway - database will sync on first workspace mount
  }

  // Import native sessions from all engines (Claude/Codex/Gemini)
  try {
    const imported = sessionImporter.importAll();
    console.log(`[Startup] Imported sessions → Claude:${imported.claude} Codex:${imported.codex} Gemini:${imported.gemini}`);
  } catch (error) {
    console.error('[Startup] ⚠️  Session import failed:', error.message);
  }

  // Auto-seed dev user on demand (Termux/local) if no users exist
  const autoSeed = process.env.NEXUSCLI_AUTO_SEED === '1';
  if (autoSeed) {
    const countStmt = prepare('SELECT COUNT(*) as count FROM users');
    const { count } = countStmt.get();
    if (count === 0) {
      const username = process.env.NEXUSCLI_SEED_USER || 'tux';
      const password = process.env.NEXUSCLI_SEED_PASS || 'tux';
      const role = 'admin';

      const user = User.create(username, password, role);
      console.log(`[AutoSeed] Created default user ${user.username} (${user.role})`);
    }
  }

  // Check for HTTPS certificates
  const certDir = path.join(process.env.HOME || '', '.nexuscli', 'certs');
  const certPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');
  const hasHttpsCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

  // Always start HTTP server on main port
  const httpServer = http.createServer(app);

  // Start HTTPS server on PORT+1 if certificates exist (for remote mic access)
  let httpsServer = null;
  const HTTPS_PORT = parseInt(PORT) + 1;

  if (hasHttpsCerts) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      httpsServer = https.createServer(httpsOptions, app);
      console.log('[Startup] HTTPS certificates found');
    } catch (err) {
      console.warn('[Startup] Failed to load certificates:', err.message);
    }
  }

  httpServer.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🚀 NexusCLI Backend                       ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    console.log(`✅ HTTP:  http://localhost:${PORT}`);

    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`🔒 HTTPS: https://localhost:${HTTPS_PORT} (for remote mic)`);
        console.log('');
        console.log('Endpoints:');
        console.log(`   GET  /health (public)`);
        console.log(`   POST /api/v1/auth/login (public)`);
        console.log(`   GET  /api/v1/auth/me (protected)`);
        console.log(`   GET  /api/v1/conversations (protected)`);
        console.log(`   POST /api/v1/conversations (protected)`);
        console.log(`   POST /api/v1/jobs (protected)`);
        console.log(`   GET  /api/v1/jobs/:id/stream (protected, SSE)`);
        console.log('');
      });
    } else {
      console.log('');
      console.log('Endpoints:');
      console.log(`   GET  /health (public)`);
      console.log(`   POST /api/v1/auth/login (public)`);
      console.log(`   GET  /api/v1/auth/me (protected)`);
      console.log(`   GET  /api/v1/conversations (protected)`);
      console.log(`   POST /api/v1/conversations (protected)`);
      console.log(`   POST /api/v1/jobs (protected)`);
      console.log(`   GET  /api/v1/jobs/:id/stream (protected, SSE)`);
      console.log('');
    }
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  process.exit(0);
});
