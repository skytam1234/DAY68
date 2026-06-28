// generateImageTool.js — Pollinations.ai (Vercel AI SDK tool).
import { tool } from 'ai';
import { z } from 'zod';
import { logEvent } from '../loggerService.js';

export const generateImageTool = tool({
  description: 'Tạo ảnh AI miễn phí từ mô tả văn bản qua Pollinations.ai. Trả về URL trực tiếp đến ảnh JPEG.',
  parameters: z.object({
    prompt: z.string().min(1).max(1000).describe('Mô tả bằng tiếng Anh càng chi tiết càng tốt. Ví dụ: "a red flag with a yellow star, the flag of Vietnam, flat illustration".'),
    width: z.number().int().min(256).max(2048).optional().describe('Chiều rộng pixel (mặc định 1024).'),
    height: z.number().int().min(256).max(2048).optional().describe('Chiều cao pixel (mặc định 1024).'),
  }),
  execute: async ({ prompt, width = 1024, height = 1024 }) => {
    const t0 = Date.now();
    logEvent('tool.generate_image', 'called', { prompt, width, height });
    if (!prompt?.trim()) {
      logEvent('tool.generate_image', 'empty_prompt', {});
      return { ok: false, error: 'prompt is empty' };
    }
    const safePrompt = prompt.trim().slice(0, 1000);
    const w = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 2048);
    const h = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 2048);
    const seed = Math.floor(Math.random() * 1e9);
    const params = new URLSearchParams({ width: String(w), height: String(h), nologo: 'true', seed: String(seed) });
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(safePrompt) + '?' + params.toString();
    logEvent('tool.generate_image', 'url_built', { url, seed, ms: Date.now() - t0 });
    return { ok: true, url, prompt: safePrompt, width: w, height: h };
  },
});