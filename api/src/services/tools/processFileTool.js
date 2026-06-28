// processFileTool.js — Process Excel/CSV/PDF/TXT files (Vercel AI SDK tool).
import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSafePath } from '../safetyService.js';

let _exceljs, _csvParse, _pdfParse;

async function getExcelJS() {
  if (!_exceljs) _exceljs = (await import('exceljs')).default;
  return _exceljs;
}
async function getCsvParse() {
  if (!_csvParse) _csvParse = (await import('csv-parse/sync')).parse;
  return _csvParse;
}
async function getPdfParse() {
  if (!_pdfParse) {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    _pdfParse = mod.default;
  }
  return _pdfParse;
}

export const processFileTool = tool({
  description: 'Đọc và phân tích file đã upload (Excel/CSV/PDF/TXT) trong workspace hoặc uploads. Hỗ trợ operation: summary (tóm tắt cấu trúc + preview), rows (lấy danh sách bản ghi), text (toàn bộ text).',
  parameters: z.object({
    path: z.string().describe('Đường dẫn tương đối của file. Ví dụ: "uploads/report.csv".'),
    operation: z.enum(['summary', 'rows', 'text']).optional().describe('Loại phân tích (mặc định summary).'),
    limit: z.number().int().min(1).max(5000).optional().describe('Giới hạn số dòng / ký tự trả về (mặc định 50).'),
  }),
  execute: async ({ path: inputPath, operation = 'summary', limit = 50 }) => {
    try {
      const abs = resolveSafePath(inputPath);
      if (!fs.existsSync(abs)) return { ok: false, error: 'File không tồn tại: ' + abs };
      const ext = path.extname(abs).toLowerCase();
      const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 5000);

      if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
        const ExcelJS = await getExcelJS();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(abs);
        const sheets = wb.worksheets.map((s) => s.name);
        const preview = [];
        for (const ws of wb.worksheets) {
          const rows = [];
          const header = ws.getRow(1).values.slice(1);
          ws.eachRow({ includeEmpty: false }, (row, num) => {
            if (num === 1) return;
            if (rows.length >= cap) return;
            const obj = {};
            row.values.slice(1).forEach((v, i) => { obj[header[i] || 'col_' + i] = v; });
            rows.push(obj);
          });
          preview.push({ sheet: ws.name, header, rows });
        }
        return { ok: true, type: 'excel', sheets, preview, truncated: preview.some((s) => s.rows.length >= cap) };
      }

      if (ext === '.csv') {
        const parse = await getCsvParse();
        const text = fs.readFileSync(abs, 'utf8');
        const records = parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true });
        const data = records.slice(0, cap);
        return { ok: true, type: 'csv', total: records.length, columns: data[0] ? Object.keys(data[0]) : [], preview: data, truncated: records.length > cap };
      }

      if (ext === '.pdf') {
        const pdfFn = await getPdfParse();
        const buf = fs.readFileSync(abs);
        const data = await pdfFn(buf);
        const sliced = data.text.slice(0, cap * 100);
        return { ok: true, type: 'pdf', size: data.text.length, preview: sliced, truncated: data.text.length > sliced.length };
      }

      const buf = fs.readFileSync(abs, 'utf8');
      const sliced = buf.slice(0, cap * 200);
      return { ok: true, type: 'text', size: buf.length, preview: sliced, truncated: buf.length > sliced.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});