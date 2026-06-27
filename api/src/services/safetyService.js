// safetyService.js — Safety checks: command blacklist, path whitelist, size limits.
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\brm\s+-fr?\b/i,
  /:\(\)\s*\{.*:\s*\};/i,
  /\bmkfs(\.[a-z0-9]+)?\b/i,
  /\bdd\s+if=/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /\binit\s+[0-6]\b/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bdel\s+\/f\b/i,
  /\bdel\s+\/s\b/i,
  /\brd\s+\/s\b/i,
  /\brd\s+\/q\b/i,
  /\breg\s+delete\b/i,
  /\bbcdedit\b/i,
  /\bdiskpart\b/i,
  /\bcipher\s+\/w\b/i,
  /\bnet\s+user\s+\/delete\b/i,
  /\bsfc\s+\/scannow\b/i,
  /\bcurl\s+[^|]*\|\s*(sh|bash|powershell)/i,
  /\bwget\s+[^|]*\|\s*(sh|bash|powershell)/i,
];

const FORBIDDEN_DIRS = [
  /[\\/]+windows[\\/]+/i,
  /[\\/]+system32[\\/]+/i,
  /[\\/]+syswow64[\\/]+/i,
  /[\\/]+program\s*files[\\/]+/i,
  /[\\/]+programdata[\\/]+/i,
  /[\\/]+boot[\\/]+/i,
  /[\\/]+etc[\\/]+/i,
  /[\\/]+usr[\\/]+/i,
  /[\\/]+proc[\\/]+/i,
  /[\\/]+sys[\\/]+/i,
  /[\\/]+sbin[\\/]+/i,
];

export function isDangerousCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) {
    return { blocked: true, reason: 'empty command' };
  }
  for (const pat of DANGEROUS_PATTERNS) {
    if (pat.test(cmd)) {
      return { blocked: true, reason: `blacklist match: ${pat}` };
    }
  }
  return { blocked: false };
}

export function resolveSafePath(inputPath, baseDir = config.paths.workspace) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new Error('path is empty');
  }
  if (inputPath.includes('\0')) {
    throw new Error('path contains NUL byte');
  }

  let resolved;
  let checkBase;
  if (path.isAbsolute(inputPath)) {
    const uploadsNorm = path.resolve(config.paths.uploads);
    const wsNorm = path.resolve(config.paths.workspace);
    const absNorm = path.resolve(inputPath);
    const inUploads = absNorm === uploadsNorm || absNorm.startsWith(uploadsNorm + path.sep);
    const inWs = absNorm === wsNorm || absNorm.startsWith(wsNorm + path.sep);
    if (!inUploads && !inWs) {
      throw new Error('absolute path outside allowed directories: ' + inputPath);
    }
    resolved = absNorm;
    checkBase = inUploads ? uploadsNorm : wsNorm;
  } else {
    resolved = path.resolve(baseDir, inputPath);
    checkBase = path.resolve(baseDir);
  }

  if (resolved !== checkBase && !resolved.startsWith(checkBase + path.sep)) {
    throw new Error('path escapes base directory: ' + inputPath);
  }
  for (const pat of FORBIDDEN_DIRS) {
    if (pat.test(resolved)) {
      throw new Error('forbidden system directory: ' + resolved);
    }
  }
  return resolved;
}

export function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export const SAFETY_INFO = {
  workspace: config.paths.workspace,
  uploads: config.paths.uploads,
  maxWriteBytes: config.limits.maxWriteBytes,
};
