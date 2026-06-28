// writeFileTool.js — Write file to workspace with size limit (Vercel AI SDK tool).
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import { resolveSafePath, ensureDirFor } from '../safetyService.js';
import { logFileOp } from '../loggerService.js';
import { config } from '../../config.js';

export const writeFileTool = tool({
  description: 'Ghi nội dung vào một file trong workspace. Tối đa 5 MB. Đường dẫn tuyệt đối hoặc truy cập ra ngoài workspace sẽ bị từ chối.',
  parameters: z.object({
    path: z.string().describe('Đường dẫn tương đối cho file đích. Ví dụ: "src/hello.txt".'),
    content: z.string().describe('Nội dung text cần ghi vào file.'),
  }),
  execute: async ({ path: inputPath, content }, { clientId = 'unknown' } = {}) => {
    try {
      if (typeof content !== 'string') {
        return { ok: false, error: 'content phải là string' };
      }
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > config.limits.maxWriteBytes) {
        logFileOp({ clientId, op: 'write', filePath: inputPath, size: bytes, ok: false, reason: 'too_large' });
        return { ok: false, error: 'Nội dung quá lớn: ' + bytes + ' > ' + config.limits.maxWriteBytes + ' bytes' };
      }
      const abs = resolveSafePath(inputPath);
      ensureDirFor(abs);
      fs.writeFileSync(abs, content, 'utf8');
      logFileOp({ clientId, op: 'write', filePath: abs, size: bytes, ok: true });
      return { ok: true, path: abs, bytes };
    } catch (e) {
      logFileOp({ clientId, op: 'write', filePath: inputPath, ok: false, reason: e.message });
      return { ok: false, error: e.message };
    }
  },
});