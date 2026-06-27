// loggerService.js — Logging service (pure logic, no HTTP/WS).
// All logging goes through this service.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(config.paths.logs);

function appendLine(file, line) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, line + '\n', 'utf8');
}

function jsonEntry(name, message, extra = {}) {
  return JSON.stringify({ ts: new Date().toISOString(), name, message, ...extra });
}

export function logEvent(name, message, extra = {}) {
  appendLine(path.join(config.paths.logs, 'app.log'), jsonEntry(name, message, extra));
  if (process.env.NODE_ENV !== 'production') {
    console.log('[' + name + '] ' + message, extra);
  }
}

export function logExec({ clientId, cmd, blocked, reason, stdout, stderr, code, ms }) {
  appendLine(path.join(config.paths.logs, 'exec.log'), jsonEntry('exec', cmd, {
    clientId, blocked: !!blocked, reason: reason || null,
    stdout: stdout ? stdout.slice(0, 4000) : '',
    stderr: stderr ? stderr.slice(0, 4000) : '',
    code: code ?? null, ms: ms ?? null,
  }));
}

export function logFileOp({ clientId, op, filePath, size, ok, reason }) {
  appendLine(path.join(config.paths.logs, 'file.log'), jsonEntry('file.' + op, filePath, {
    clientId, size: size ?? null, ok: !!ok, reason: reason || null,
  }));
}
