// slashCommands.js — Direct tool invocation via `/command args` syntax.
//
// When a user message starts with `/`, we bypass the LLM entirely and call the
// matching tool with the parsed arguments. This is reliable on free-tier
// models that frequently ignore tool calls.
//
// Supported commands:
//   /image <prompt>             → generate_image(prompt)
//   /search <query>             → search_web(query)
//   /read <path> [max_bytes]    → read_file(path, max_bytes)
//   /write <path> <content>     → write_file(path, content)
//   /exec <cmd>                 → exec(cmd)
//   /help                       → list available commands
import { generateImageTool } from './tools/generateImageTool.js';
import { searchWebTool } from './tools/searchWebTool.js';
import { readFileTool } from './tools/readFileTool.js';
import { writeFileTool } from './tools/writeFileTool.js';
import { execTool } from './tools/execTool.js';
import { logEvent } from './loggerService.js';

const HELP_TEXT = [
  'Các lệnh trực tiếp (bỏ qua LLM, chạy tool ngay):',
  '  /image <prompt>          — tạo ảnh AI từ prompt',
  '  /search <query>          — tìm kiếm web',
  '  /read <path>             — đọc file trong workspace',
  '  /read <path> <max_bytes> — đọc file giới hạn byte',
  '  /write <path> <content>  — ghi file (path và content phân cách bằng dấu cách đầu tiên sau path)',
  '  /exec <cmd>              — chạy lệnh shell an toàn',
  '  /help                    — hiện danh sách lệnh',
].join('\n');

export function isSlashCommand(text) {
  return typeof text === 'string' && text.trimStart().startsWith('/');
}

export function parseSlashCommand(text) {
  const trimmed = text.trimStart();
  // Match /cmd followed by a space; otherwise it's `/help` with no args or unknown.
  const match = trimmed.match(/^\/([a-zA-Z_]+)(?:\s+([\s\S]*))?$/);
  if (!match) return { cmd: trimmed.toLowerCase(), args: '' };
  return { cmd: '/' + match[1].toLowerCase(), args: (match[2] || '').trim() };
}

/**
 * Execute a slash command and return a normalized result envelope.
 * @param {{ clientId?: string, cmd: string, args: string }} input
 * @returns {Promise<{ ok: boolean, kind: string, summary: string, payload?: object, imageUrl?: string }>}
 */
export async function executeSlashCommand({ clientId, cmd, args }) {
  const ctx = { clientId: clientId || 'unknown' };

  switch (cmd) {
    case '/help':
      logEvent('slash', 'help', { clientId });
      return { ok: true, kind: 'text', summary: HELP_TEXT };

    case '/image': {
      if (!args) {
        logEvent('slash', 'image_missing_args', { clientId });
        return { ok: false, kind: 'text', summary: 'Cú pháp: /image <prompt>. Ví dụ: /image a red flag with a yellow star, flat illustration' };
      }
      logEvent('slash', 'image_called', { clientId, prompt: args });
      const out = await generateImageTool.execute({ prompt: args, width: 1024, height: 1024 });
      logEvent('slash', 'image_done', { clientId, ok: !!out?.ok, url: out?.url });
      if (out?.ok && out.url) {
        return {
          ok: true,
          kind: 'image',
          summary: 'Đã tạo ảnh: ' + out.url,
          payload: out,
          imageUrl: out.url,
        };
      }
      return { ok: false, kind: 'text', summary: 'Tạo ảnh thất bại: ' + (out?.error || 'unknown'), payload: out };
    }

    case '/search': {
      if (!args) {
        logEvent('slash', 'search_missing_args', { clientId });
        return { ok: false, kind: 'text', summary: 'Cú pháp: /search <query>. Ví dụ: /search tin AI mới nhất' };
      }
      logEvent('slash', 'search_called', { clientId, query: args });
      const out = await searchWebTool.execute({ query: args, num_results: 5 });
      logEvent('slash', 'search_done', { clientId, ok: !!out?.ok, count: out?.results?.length });
      if (out?.ok && Array.isArray(out.results)) {
        const bullets = out.results.slice(0, 5)
          .map((r, i) => (i + 1) + '. [' + r.title + '](' + r.url + ')' + (r.snippet ? ' — ' + r.snippet : ''))
          .join('\n');
        return { ok: true, kind: 'text', summary: 'Kết quả cho "' + args + '":\n' + bullets, payload: out };
      }
      return { ok: false, kind: 'text', summary: 'Tìm kiếm thất bại: ' + (out?.error || 'unknown'), payload: out };
    }

    case '/read': {
      if (!args) {
        logEvent('slash', 'read_missing_args', { clientId });
        return { ok: false, kind: 'text', summary: 'Cú pháp: /read <path> [max_bytes]' };
      }
      // Split args into path + optional max_bytes.
      const parts = args.split(/\s+/);
      const filePath = parts[0];
      const maxBytes = parts[1] ? parseInt(parts[1], 10) : undefined;
      logEvent('slash', 'read_called', { clientId, filePath, maxBytes });
      const out = await readFileTool.execute({ path: filePath, max_bytes: maxBytes }, ctx);
      logEvent('slash', 'read_done', { clientId, ok: !!out?.ok });
      if (out?.ok) {
        if (out.type === 'directory') {
          return { ok: true, kind: 'text', summary: 'Thư mục ' + filePath + ':\n' + (out.items || []).join('\n'), payload: out };
        }
        return {
          ok: true,
          kind: 'text',
          summary: 'Nội dung ' + filePath + (out.truncated ? ' (đã cắt bớt)' : '') + ':\n```\n' + out.content + '\n```',
          payload: out,
        };
      }
      return { ok: false, kind: 'text', summary: 'Đọc file thất bại: ' + (out?.error || 'unknown'), payload: out };
    }

    case '/write': {
      if (!args) {
        logEvent('slash', 'write_missing_args', { clientId });
        return { ok: false, kind: 'text', summary: 'Cú pháp: /write <path> <content>' };
      }
      // First whitespace separates path from content.
      const spaceIdx = args.search(/\s/);
      if (spaceIdx < 0) {
        return { ok: false, kind: 'text', summary: 'Cần cả path và content. Ví dụ: /write hello.txt "Xin chào"' };
      }
      const filePath = args.slice(0, spaceIdx);
      const content = args.slice(spaceIdx + 1);
      logEvent('slash', 'write_called', { clientId, filePath, bytes: content.length });
      const out = await writeFileTool.execute({ path: filePath, content }, ctx);
      logEvent('slash', 'write_done', { clientId, ok: !!out?.ok });
      if (out?.ok) {
        return { ok: true, kind: 'text', summary: 'Đã ghi ' + out.bytes + ' bytes vào ' + out.path, payload: out };
      }
      return { ok: false, kind: 'text', summary: 'Ghi file thất bại: ' + (out?.error || 'unknown'), payload: out };
    }

    case '/exec': {
      if (!args) {
        logEvent('slash', 'exec_missing_args', { clientId });
        return { ok: false, kind: 'text', summary: 'Cú pháp: /exec <cmd>' };
      }
      logEvent('slash', 'exec_called', { clientId, cmd: args });
      const out = await execTool.execute({ cmd: args }, ctx);
      logEvent('slash', 'exec_done', { clientId, ok: !!out?.ok, blocked: !!out?.blocked });
      if (out?.ok) {
        const body = (out.stdout || '') + (out.stderr ? '\n[stderr]\n' + out.stderr : '');
        return { ok: true, kind: 'text', summary: '$ ' + args + '\n' + body, payload: out };
      }
      if (out?.blocked) {
        return { ok: false, kind: 'text', summary: 'Lệnh bị chặn: ' + out.reason, payload: out };
      }
      return { ok: false, kind: 'text', summary: 'Lệnh thất bại: ' + (out?.error || 'unknown'), payload: out };
    }

    default:
      logEvent('slash', 'unknown_cmd', { clientId, cmd });
      return { ok: false, kind: 'text', summary: 'Lệnh không tồn tại: ' + cmd + '\n\n' + HELP_TEXT };
  }
}
