// agentService.js — Wraps llmService.streamChat with the project's callback
// shape (onThinking, onContent, onToolCall, onToolResult, onRespond) and
// emits the `respond` event with the parsed answer text.
import { buildSystemPrompt } from '../prompt.js';

function parseRespondContent(text) {
  if (!text) return '';
  // Try to find a JSON object with action === 'respond' or just an 'answer' field.
  // Order of attempts: 1) full JSON parse, 2) code-fenced JSON, 3) any {..."answer":...}
  const trimmed = text.trim();

  // Attempt 1: full JSON parse
  try { const p = JSON.parse(trimmed); return extractAnswer(p); } catch {}

  // Attempt 2: strip code fences
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { const p = JSON.parse(stripped); return extractAnswer(p); } catch {}

  // Attempt 3: find any {..."answer":...} substring
  const m = trimmed.match(/\{[\s\S]*?"answer"\s*:\s*(".*?"|\d+|\[.*?\]|true|false|null)[\s\S]*?\}/);
  if (m) {
    try { return extractAnswer(JSON.parse(m[0])); } catch {}
  }

  // Fallback: return raw text stripped of fences
  return stripped;
}

function extractAnswer(obj) {
  if (!obj || typeof obj !== 'object') return String(obj);
  // If it's an action envelope { action, params }
  if (obj.action === 'respond' && obj.params?.answer != null) return String(obj.params.answer);
  // If it's a direct { answer, ... } shape
  if (obj.answer != null) return String(obj.answer);
  // If no known shape, return JSON stringified (without inner code fences)
  const str = JSON.stringify(obj);
  return str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export async function runAgent({ clientId, history, callbacks, signal }) {
  const systemPrompt = buildSystemPrompt();

  const emit = (name, ...args) => {
    if (signal?.aborted) return;
    const cb = callbacks['on' + name[0].toUpperCase() + name.slice(1)] || callbacks[name];
    if (cb) cb(...args);
  };

  emit('turnStart', 1);

  let lastContent = '';

  try {
    const { streamChat } = await import('./llmService.js');
    await streamChat({
      system: systemPrompt,
      messages: history,
      signal,
      onThinking: (delta) => emit('thinking', delta),
      onChunk: (delta) => {
        lastContent += delta;
        emit('content', delta);
      },
      onToolCall: (name, args) => emit('toolCall', name, args),
      onToolResult: (name, result) => {
        emit('toolResult', name, result);
        if (name === 'generate_image' && result?.ok && result.url) {
          emit('image', result.url, result.prompt || '');
        }
      },
    });
  } catch (e) {
    emit('error', e.message || String(e));
    throw e;
  }

  const answer = parseRespondContent(lastContent);
  emit('respond', answer, []);
}