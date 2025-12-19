/**
 * Post-build script to inject dynamic cache version into sw.js
 * This ensures cache invalidation on every build
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.join(__dirname, '../dist/sw.js');

// Generate version from timestamp
const version = `nexuscli-v${Date.now()}`;

try {
  let swContent = fs.readFileSync(swPath, 'utf8');

  // Replace the hardcoded version
  swContent = swContent.replace(
    /const CACHE_VERSION = 'nexuscli-v\d*';?/,
    `const CACHE_VERSION = '${version}';`
  );

  fs.writeFileSync(swPath, swContent);
  console.log(`[SW] Cache version injected: ${version}`);
} catch (err) {
  console.error('[SW] Failed to inject version:', err.message);
  process.exit(1);
}
