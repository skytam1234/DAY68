// writeFileTool.js — Write file to workspace with size limit.
import fs from 'node:fs';
import { resolveSafePath, ensureDirFor } from '../safetyService.js';
import { logFileOp } from '../loggerService.js';
import { config } from '../../config.js';

export const definition = {
  name: 'write_file',
  description: 'Ghi nội dung vào file trong workspace (giới hạn 5 MB).',
  params: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
};

export async function execute({ path: inputPath, content }, ctx) {
  try {
    if (typeof content !== 'string') {
      return { ok: false, error: 'content phải là string' };
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > config.limits.maxWriteBytes) {
      logFileOp({ clientId: ctx.clientId, op: 'write', filePath: inputPath, size: bytes, ok: false, reason: 'too_large' });
      return { ok: false, error: 'Nội dung quá lớn: ' + bytes + ' > ' + config.limits.maxWriteBytes + ' bytes' };
    }
    const abs = resolveSafePath(inputPath);
    ensureDirFor(abs);
    fs.writeFileSync(abs, content, 'utf8');
    logFileOp({ clientId: ctx.clientId, op: 'write', filePath: abs, size: bytes, ok: true });
    return { ok: true, path: abs, bytes };
  } catch (e) {
    logFileOp({ clientId: ctx.clientId, op: 'write', filePath: inputPath, ok: false, reason: e.message });
    return { ok: false, error: e.message };
  }
}
