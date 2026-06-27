// readFileTool.js — Read file from workspace or uploads.
import fs from 'node:fs';
import { resolveSafePath } from '../safetyService.js';
import { logFileOp } from '../loggerService.js';

export const definition = {
  name: 'read_file',
  description: 'Đọc nội dung file trong workspace hoặc uploads.',
  params: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      max_bytes: { type: 'integer', default: 200000 },
    },
    required: ['path'],
  },
};

export async function execute({ path: inputPath, max_bytes = 200000 }, ctx) {
  try {
    const abs = resolveSafePath(inputPath);
    if (!fs.existsSync(abs)) {
      logFileOp({ clientId: ctx.clientId, op: 'read', filePath: abs, ok: false, reason: 'not_found' });
      return { ok: false, error: 'File không tồn tại: ' + abs };
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(abs).slice(0, 200);
      logFileOp({ clientId: ctx.clientId, op: 'read_dir', filePath: abs, ok: true });
      return { ok: true, type: 'directory', items };
    }
    const bytesToRead = Math.min(stat.size, max_bytes);
    const buf = fs.readFileSync(abs, { encoding: 'utf8', flag: 'r' });
    const truncated = buf.length > bytesToRead;
    logFileOp({ clientId: ctx.clientId, op: 'read', filePath: abs, size: stat.size, ok: true });
    return {
      ok: true, type: 'file', size: stat.size,
      truncated, content: truncated ? buf.slice(0, bytesToRead) : buf,
    };
  } catch (e) {
    logFileOp({ clientId: ctx.clientId, op: 'read', filePath: inputPath, ok: false, reason: e.message });
    return { ok: false, error: e.message };
  }
}
