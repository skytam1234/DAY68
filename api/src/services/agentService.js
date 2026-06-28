// agentService.js — Manual ReAct agent loop with consecutive-error cap.
//
// Pipeline:
//   1. Slash command shortcut  — `/cmd args` bypasses the LLM entirely.
//   2. ReAct loop              — otherwise, run a loop where each iteration
//                                makes one model turn via streamChat:
//                                  a. Model emits reasoning + (text | tool_calls)
//                                  b. If only text and non-empty: that's the
//                                     final answer → exit with success.
//                                  c. If tool_calls: the AI SDK auto-executes
//                                     them (because their definitions include
//                                     `execute`) and emits `tool-result`. The
//                                     SDK's `response.messages` then contains
//                                     both the assistant tool-call part AND
//                                     the matching tool-result part in the
//                                     exact CoreMessage shape the API needs.
//                                  d. Stream errors and tool failures count
//                                     toward `MAX_ERRORS` consecutive errors.
//                                     A success resets the counter.
//                                  e. After MAX_ERRORS consecutive failures,
//                                     give up with "AI không xử lý được".
//   3. Intent fallback         — if the loop ends without producing a usable
//                                result and the user clearly asked for an
//                                image or web search, run the tool directly.
import { buildSystemPrompt } from '../prompt.js';
import { streamChat } from './llmService.js';
import { logEvent } from './loggerService.js';
import { generateImageTool } from './tools/generateImageTool.js';
import { searchWebTool } from './tools/searchWebTool.js';
import { isSlashCommand, parseSlashCommand, executeSlashCommand } from './slashCommands.js';

// Maximum consecutive errors before giving up. The loop is otherwise
// unbounded — it runs until the model emits a final text answer.
const MAX_ERRORS = 4;

const IMAGE_INTENT_RE = /\b(vẽ|tạo\s*ảnh|vẽ\s*tranh|vẽ\s*hình|tạo\s*hình|draw|paint|generate\s*image|tạo\s*tranh|minh\s*hoạ|minh\s*họa|illustration)\b/i;
const SEARCH_INTENT_RE = /\b(tìm|search|tra\s*cứu|google|tra\s*tin|tin\s*tức)\b/i;

function extractImagePrompt(lastUserText) {
  if (!lastUserText) return null;
  const cleaned = lastUserText
    .replace(/^(hãy\s+)?(vẽ|tạo\s*ảnh|vẽ\s*tranh|vẽ\s*hình|tạo\s*hình|create|generate)\s*(cho\s*(tôi|mình)?\s*)?/i, '')
    .replace(/^(cho\s*tôi|cho\s*mình)\s+/i, '')
    .replace(/^1\s+/i, 'a ')
    .replace(/^một\s+/i, 'a ')
    .replace(/\s+(đi|nhé|thôi|nha|ngay)\s*[\.\!\?]*\s*$/i, '')
    .trim();
  return cleaned || lastUserText.trim();
}

function lastUserMessage(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'user') return String(history[i]?.content || '');
  }
  return '';
}

function detectIntent(text) {
  if (!text) return null;
  if (IMAGE_INTENT_RE.test(text)) return 'generate_image';
  if (SEARCH_INTENT_RE.test(text)) return 'search_web';
  return null;
}

/**
 * @param {{ clientId?: string, history: Array<object>, callbacks: object, signal?: AbortSignal }} opts
 */
export async function runAgent({ clientId, history, callbacks, signal }) {
  const systemPrompt = buildSystemPrompt();
  logEvent('agent', 'run_start', { clientId, historyLen: history.length, systemPromptLen: systemPrompt.length });

  const emit = (name, ...args) => {
    if (signal?.aborted) return;
    const cb = callbacks['on' + name[0].toUpperCase() + name.slice(1)] || callbacks[name];
    if (cb) cb(...args);
  };

  emit('turnStart', 1);

  // ---- Shortcut 1: explicit `/command args` ----
  const userText0 = lastUserMessage(history);
  if (userText0 && isSlashCommand(userText0)) {
    const { cmd, args } = parseSlashCommand(userText0);
    logEvent('agent', 'slash_command_detected', { clientId, cmd, argsLen: args.length });
    try {
      const result = await executeSlashCommand({ clientId, cmd, args });
      logEvent('agent', 'slash_command_done', { clientId, cmd, ok: result.ok, kind: result.kind });
      emit('toolCall', cmd.slice(1), args);
      emit('toolResult', cmd.slice(1), result.payload || { ok: result.ok, summary: result.summary });
      if (result.kind === 'image' && result.imageUrl) {
        emit('image', result.imageUrl, args);
      }
      emit('respond', result.summary, result.imageUrl ? [result.imageUrl] : []);
    } catch (e) {
      logEvent('agent.error', e.message || String(e), { clientId, phase: 'slash' });
      emit('error', e.message || String(e));
      throw e;
    }
    return;
  }

  // ---- ReAct loop ----
  // Mutable working copy of the message history we'll feed to the LLM.
  // We strip our internal history down to { role, content } for the first
  // turn, then progressively append assistant + tool messages as the loop
  // progresses. Tool definitions live in `llmService.js`.
  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  let totalToolCalls = 0;
  let loopFinalText = '';
  let usedFallback = false;
  let halted = false;
  let consecutiveErrors = 0;
  let loop = 0;
  let streamError = null;
  let collectedImages = []; // [{ url, prompt }] — accumulated across turns

  try {
    while (!signal?.aborted) {
      loop++;
      logEvent('agent', 'loop_start', {
        clientId, loop, consecutiveErrors, maxErrors: MAX_ERRORS,
        messages: messages.length,
      });
      emit('turnStart', loop);

      let turnToolCalls = 0;
      let turnText = '';
      let collectedResults = []; // [{ name, args, result }] from this turn
      let turnHadError = false;

      let stepResult;
      try {
        stepResult = await streamChat({
          system: systemPrompt,
          messages,
          signal,
          clientId,
          maxSteps: 1, // one model turn per loop iteration
          onThinking: (delta) => emit('thinking', delta),
          onChunk: (delta) => emit('content', delta),
          onToolCall: (name, args) => {
            turnToolCalls++;
            totalToolCalls++;
            emit('toolCall', name, args);
          },
          onToolResult: (name, result, args) => {
            const ok = !!(result && result.ok !== false && !result.blocked);
            if (!ok) turnHadError = true;
            emit('toolResult', name, result);
            collectedResults.push({ name, args, result });
            if (name === 'generate_image' && result?.ok && result.url) {
              collectedImages.push({ url: result.url, prompt: result.prompt || args?.prompt || '' });
            }
          },
          onImage: (url, prompt) => emit('image', url, prompt),
          onFinish: (info) => emit('finish', info),
        });
      } catch (e) {
        // Stream-level error (network, API, parse). Count as a consecutive
        // error and decide whether to retry or give up.
        consecutiveErrors++;
        streamError = e?.message || String(e);
        logEvent('agent.error', streamError, {
          clientId, loop, phase: 'stream', consecutiveErrors,
        });
        emit('toolResult', 'stream_error', { ok: false, error: streamError });
        if (consecutiveErrors >= MAX_ERRORS) break;
        continue;
      }

      turnText = stepResult.text || '';

      // Get the full message list from the SDK response. AI SDK v5 auto-
      // executes the tool when its definition includes `execute`, so the
      // returned `response.messages` already contains:
      //   1. assistant message with tool-call part
      //   2. assistant message with tool-result part
      // in the exact CoreMessage shape the API requires. We re-feed those
      // on the next turn instead of constructing our own.
      let appendedAny = false;
      try {
        const resp = stepResult.response;
        const msgs = resp?.messages || resp?.responseMessages;
        if (Array.isArray(msgs) && msgs.length) {
          for (const m of msgs) {
            messages.push(m);
            appendedAny = true;
          }
        }
      } catch {}
      if (!appendedAny) {
        // Fallback: a plain text assistant message. This loses tool-call
        // parts, so the next turn won't see any tool history — but at
        // least the message stays valid for the API.
        messages.push({ role: 'assistant', content: turnText });
      }

      // Case A: model produced text and no tool calls → that's the answer.
      if (turnToolCalls === 0) {
        if (turnText.trim()) {
          loopFinalText = turnText;
          consecutiveErrors = 0; // reset on success
          halted = true;
          logEvent('agent', 'loop_text_answer', { clientId, loop, len: turnText.length });
          break;
        }
        // Empty text with no tool calls = model stalled. Count as error.
        consecutiveErrors++;
        logEvent('agent', 'loop_empty_response', { clientId, loop, consecutiveErrors });
        emit('toolResult', 'empty_response', { ok: false, error: 'model_returned_no_text' });
        if (consecutiveErrors >= MAX_ERRORS) break;
        continue;
      }

      // Case B: model emitted (and SDK executed) tool calls. A successful
      // run resets the consecutive-error counter; any failure increments it.
      if (turnHadError) {
        consecutiveErrors++;
        logEvent('agent', 'tool_error_counted', { clientId, loop, consecutiveErrors });
        if (consecutiveErrors >= MAX_ERRORS) break;
      } else {
        consecutiveErrors = 0;
      }
      // Loop again — model sees the tool-result parts and either calls
      // more tools or emits the final text answer.
    }
  } catch (e) {
    logEvent('agent.error', e.message || String(e), { clientId, phase: 'loop' });
    emit('error', e.message || String(e));
    throw e;
  }

  // ---- Shortcut 2: intent fallback if the LLM never engaged with tools ----
  // Runs only when the loop produced no usable tool result. If the loop
  // already tried tools and failed, the error-cap fallback below handles it.
  if (!loopFinalText && !signal?.aborted && (totalToolCalls === 0 || consecutiveErrors > 0)) {
    const userText = lastUserMessage(history);
    const intent = detectIntent(userText);
    if (intent === 'generate_image') {
      const prompt = extractImagePrompt(userText);
      logEvent('agent.fallback', 'image_intent_detected', { clientId, prompt });
      emit('toolCall', 'generate_image', { prompt });
      const out = await generateImageTool.execute({ prompt, width: 1024, height: 1024 });
      logEvent('agent.fallback', 'image_executed', { clientId, ok: !!out?.ok });
      emit('toolResult', 'generate_image', out);
      if (out?.ok && out?.url) {
        emit('image', out.url, out.prompt || prompt);
        collectedImages.push({ url: out.url, prompt: out.prompt || prompt });
        loopFinalText = loopFinalText
          ? loopFinalText + '\n\nẢnh bạn yêu cầu: ' + out.url
          : 'Đây là ảnh bạn yêu cầu: ' + out.url;
      } else {
        loopFinalText = (loopFinalText || '') + '\n\n(Không thể tạo ảnh: ' + (out?.error || 'unknown') + ')';
      }
      usedFallback = true;
    } else if (intent === 'search_web') {
      const q = userText.replace(SEARCH_INTENT_RE, '').trim();
      logEvent('agent.fallback', 'search_intent_detected', { clientId, q });
      emit('toolCall', 'search_web', { query: q });
      const out = await searchWebTool.execute({ query: q, num_results: 5 });
      logEvent('agent.fallback', 'search_executed', { clientId, ok: !!out?.ok });
      emit('toolResult', 'search_web', out);
      if (out?.ok && Array.isArray(out.results) && out.results.length) {
        const bullets = out.results.slice(0, 5).map((r, i) => (i + 1) + '. [' + r.title + '](' + r.url + ')').join('\n');
        loopFinalText = loopFinalText
          ? loopFinalText + '\n\nKết quả tìm kiếm cho "' + q + '":\n' + bullets
          : 'Kết quả tìm kiếm cho "' + q + '":\n' + bullets;
      }
      usedFallback = true;
    }
  }

  // ---- Error-cap fallback: MAX_ERRORS consecutive failures ----
  if (!loopFinalText && !signal?.aborted) {
    logEvent('agent', 'max_errors_reached', {
      clientId, consecutiveErrors, maxErrors: MAX_ERRORS,
      totalToolCalls, lastError: streamError,
    });
    loopFinalText = 'Xin lỗi, AI không xử lý được yêu cầu này sau ' + MAX_ERRORS + ' lần thử liên tiếp gặp lỗi.'
      + (streamError ? ' (Lỗi cuối: ' + streamError + ')' : '')
      + ' Bạn có thể diễn đạt lại hoặc dùng lệnh trực tiếp như /image, /search, /read, /exec.';
  }

  logEvent('agent', 'run_finish', {
    clientId,
    textLen: loopFinalText.length,
    usedFallback,
    halted,
    totalToolCalls,
    consecutiveErrors,
    loops: loop,
    imageCount: collectedImages.length,
  });

  emit('respond', loopFinalText, collectedImages);
}
