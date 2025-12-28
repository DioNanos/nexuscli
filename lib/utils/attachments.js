const fs = require('fs');
const path = require('path');
const { fixTermuxPath } = require('./workspace');

const ATTACHMENT_LINE_REGEX = /^\s*\[Attached:\s*(.+?)\s*\]\s*$/;
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.heic'
]);

function parseAttachmentMarkers(message = '') {
  if (!message) {
    return { cleanMessage: message, paths: [] };
  }

  const lines = message.split('\n');
  const paths = [];
  const kept = [];

  for (const line of lines) {
    const match = line.match(ATTACHMENT_LINE_REGEX);
    if (match) {
      paths.push(match[1]);
      continue;
    }
    kept.push(line);
  }

  const cleanMessage = kept.join('\n').trim();
  return { cleanMessage, paths };
}

function isImageAttachment(attachment) {
  const mimeType = attachment?.mimeType || '';
  if (mimeType.startsWith('image/')) return true;
  const ext = path.extname(attachment?.path || '').toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function normalizeAttachmentPath(rawPath, workspacePath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let fixedPath = fixTermuxPath(rawPath);
  if (!path.isAbsolute(fixedPath) && workspacePath) {
    fixedPath = path.resolve(workspacePath, fixedPath);
  }
  return fixedPath;
}

function normalizeAttachments({ message, rawMessage, attachments, workspacePath }) {
  const parsed = parseAttachmentMarkers(message || '');
  const promptMessage = rawMessage != null ? rawMessage : (parsed.cleanMessage || message || '');

  const incoming = [];
  if (Array.isArray(attachments)) {
    incoming.push(...attachments);
  }
  if (parsed.paths.length > 0) {
    parsed.paths.forEach((p) => incoming.push({ path: p }));
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of incoming) {
    if (!entry) continue;
    const rawPath = typeof entry === 'string' ? entry : entry.path;
    const resolvedPath = normalizeAttachmentPath(rawPath, workspacePath);
    if (!resolvedPath) continue;
    if (!fs.existsSync(resolvedPath)) continue;
    if (seen.has(resolvedPath)) continue;

    seen.add(resolvedPath);
    const record = {
      ...entry,
      path: resolvedPath,
      name: entry.name || path.basename(resolvedPath)
    };
    normalized.push(record);
  }

  const attachmentPaths = normalized.map((att) => att.path);
  const includeDirectories = Array.from(
    new Set(attachmentPaths.map((p) => path.dirname(p)))
  );
  const imageFiles = normalized.filter(isImageAttachment).map((att) => att.path);

  return {
    promptMessage,
    attachments: normalized,
    attachmentPaths,
    includeDirectories,
    imageFiles,
    cleanMessage: parsed.cleanMessage
  };
}

module.exports = {
  normalizeAttachments,
  parseAttachmentMarkers,
  isImageAttachment
};
