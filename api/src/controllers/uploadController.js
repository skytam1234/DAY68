// uploadController.js — File upload via multer.
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { SAFETY_INFO } from '../services/safetyService.js';
import { logFileOp } from '../services/loggerService.js';
import fs from 'node:fs';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(config.paths.uploads);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.paths.uploads),
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'upload')
        .replace(/[^A-Za-z0-9._-]/g, '_')
        .slice(0, 100);
      cb(null, nanoid(8) + '_' + safe);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const uploadMiddleware = upload.single('file');

export async function handleUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const relPath = path.relative(config.paths.workspace, req.file.path) || path.basename(req.file.path);
  logFileOp({
    clientId: req.body.clientId || 'http',
    op: 'upload',
    filePath: req.file.path,
    size: req.file.size,
    ok: true,
  });
  res.json({
    ok: true,
    path: req.file.path,
    relPath,
    size: req.file.size,
    name: req.file.originalname,
  });
}
