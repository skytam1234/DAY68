// readFileTool.js — Read file from workspace or uploads (Vercel AI SDK tool).
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import { resolveSafePath } from '../safetyService.js';
import { logFileOp } from '../loggerService.js';

export const readFileTool = tool({
  description: 'Đọc nội dung một file trong workspace hoặc thư mục uploads. Trả về nội dung text (tối đa max_bytes ký tự).',
  parameters: z.object({
    path: z.string().describe('Đường dẫn tương đối của file. Ví dụ: "src/index.js", "uploads/report.csv".'),
    max_bytes: z.number().int().positive().max(2000000).optional().describe('Giới hạn byte đọc (mặc định 200000).'),
  }),
  execute: async ({ path: inputPath, max_bytes = 200000 }, { clientId = 'unknown' } = {}) => {
    try {
      const abs = resolveSafePath(inputPath);
      if (!fs.existsSync(abs)) {
        logFileOp({ clientId, op: 'read', filePath: abs, ok: false, reason: 'not_found' });
        return { ok: false, error: 'File không tồn tại: ' + abs };
      }
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        const items = fs.readdirSync(abs).slice(0, 200);
        logFileOp({ clientId, op: 'read_dir', filePath: abs, ok: true });
        return { ok: true, type: 'directory', items };
      }
      const bytesToRead = Math.min(stat.size, max_bytes);
      const buf = fs.readFileSync(abs, { encoding: 'utf8', flag: 'r' });
      const truncated = buf.length > bytesToRead;
      logFileOp({ clientId, op: 'read', filePath: abs, size: stat.size, ok: true });
      return {
        ok: true, type: 'file', size: stat.size,
        truncated, content: truncated ? buf.slice(0, bytesToRead) : buf,
      };
    } catch (e) {
      logFileOp({ clientId, op: 'read', filePath: inputPath, ok: false, reason: e.message });
      return { ok: false, error: e.message };
    }
  },
});