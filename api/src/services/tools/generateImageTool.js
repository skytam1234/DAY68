// generateImageTool.js — Pollinations.ai (free, no API key).
export const definition = {
  name: 'generate_image',
  description: 'Tạo ảnh AI từ mô tả văn bản qua Pollinations.ai (miễn phí).',
  params: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      width: { type: 'integer', default: 1024 },
      height: { type: 'integer', default: 1024 },
    },
    required: ['prompt'],
  },
};

export async function execute({ prompt, width = 1024, height = 1024 }, ctx) {
  if (!prompt?.trim()) return { ok: false, error: 'prompt is empty' };
  const safePrompt = prompt.trim().slice(0, 1000);
  const w = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 2048);
  const h = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 2048);
  const seed = Math.floor(Math.random() * 1e9);
  const params = new URLSearchParams({ width: String(w), height: String(h), nologo: 'true', seed: String(seed) });
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(safePrompt) + '?' + params.toString();
  return { ok: true, url, prompt: safePrompt, width: w, height: h };
}
