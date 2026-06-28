// llmService.js — Vercel AI SDK streaming agent with tool calling.
//
// Uses @openrouter/ai-sdk-provider against OpenRouter's chat-completions API.
// We consume `result.fullStream` directly: it's a discriminated union of
// `text-delta`, `reasoning`, `tool-call`, `tool-result`, `finish`, `error`
// events. We translate them into the project's callback contract
// (onThinking / onChunk / onToolCall / onToolResult / onImage / onFinish).
//
// Loop control is delegated to the caller (agentService.js). We accept an
// optional `maxSteps` parameter and run the SDK's `stopWhen` accordingly so
// the caller can run a multi-turn loop with full message-history tracking.
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { config } from '../config.js';
import { buildTools } from './tools/index.js';
import { logEvent } from './loggerService.js';

const openrouter = createOpenRouter({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

/**
 * @param {{ system?: string, messages: Array<object>, signal?: AbortSignal,
 *   clientId?: string,
 *   maxSteps?: number,
 *   onThinking?: (delta: string) => void,
 *   onChunk?: (delta: string) => void,
 *   onToolCall?: (name: string, args: object) => void,
 *   onToolResult?: (name: string, result: object, args: object) => void,
 *   onImage?: (url: string, prompt: string) => void,
 *   onFinish?: (info: { reason: string, usage?: object }) => void,
 * }} opts
 */
export async function streamChat(opts) {
  const {
    system,
    messages,
    signal,
    clientId,
    maxSteps,
    onThinking,
    onChunk,
    onToolCall,
    onToolResult,
    onImage,
    onFinish,
  } = opts;

  const experimental_context = { clientId: clientId || 'unknown' };
  const stopAfterSteps = maxSteps ?? config.limits.agentMaxTurns ?? 10;

  logEvent('llm', 'stream_start', {
    clientId,
    model: config.llm.model,
    msgs: messages.length,
    tools: Object.keys(buildTools()),
    maxSteps: stopAfterSteps,
  });

  // Pass tools through unchanged. The AI SDK executes them automatically
  // when their definition includes `execute`, which is exactly what we want
  // for the ReAct loop: the resulting `response.messages` will contain both
  // the assistant tool-call part AND the tool-result part in the exact
  // CoreMessage shape the API requires. If we stripped `execute` ourselves
  // and appended our own `role: 'tool'` messages we'd violate that shape
  // (see AI SDK v5 error: "Invalid prompt: message must be a CoreMessage").
  const toolsForRequest = buildTools();

  const result = streamText({
    model: openrouter.chat(config.llm.model),
    system,
    messages,
    tools: toolsForRequest,
    // `stopAfterSteps` of 1 means: at most one model turn per call. The
    // caller loops, appending the response's `messages` (which already
    // include assistant + tool-result parts) until the model emits text-
    // only or the caller's error cap is reached.
    stopWhen: ({ steps }) => steps.length >= stopAfterSteps,
    abortSignal: signal,
    experimental_context,
  });

  let textAccum = '';
  let reasoningAccum = '';
  let lastFinishReason = 'stop';
  let textDeltaCount = 0;
  let reasoningDeltaCount = 0;
  let toolCallCount = 0;
  let toolResultCount = 0;
  const t0 = Date.now();

  for await (const part of result.fullStream) {
    if (signal?.aborted) break;
    switch (part.type) {
      case 'reasoning-delta':
      case 'reasoning':
        if (part.textDelta) {
          reasoningAccum += part.textDelta;
          reasoningDeltaCount++;
          if (reasoningDeltaCount === 1 || reasoningDeltaCount % 20 === 0) {
            logEvent('llm.stream', 'reasoning_delta', { clientId, count: reasoningDeltaCount, totalChars: reasoningAccum.length });
          }
          if (onThinking) onThinking(part.textDelta);
        }
        break;
      case 'text-delta':
        textAccum += part.textDelta;
        textDeltaCount++;
        if (textDeltaCount === 1 || textDeltaCount % 20 === 0) {
          logEvent('llm.stream', 'text_delta', { clientId, count: textDeltaCount, totalChars: textAccum.length });
        }
        if (onChunk) onChunk(part.textDelta);
        break;
      case 'tool-call':
        toolCallCount++;
        logEvent('llm.stream', 'tool_call', {
          clientId,
          count: toolCallCount,
          toolName: part.toolName,
          input: part.input,
        });
        if (onToolCall) onToolCall(part.toolName, part.input || {});
        break;
      case 'tool-result': {
        toolResultCount++;
        const out = part.output ?? part.result ?? {};
        logEvent('llm.stream', 'tool_result', {
          clientId,
          count: toolResultCount,
          toolName: part.toolName,
          ok: !!out?.ok,
          keys: Object.keys(out || {}),
        });
        if (onToolResult) onToolResult(part.toolName, out, part.input || {});
        if (part.toolName === 'generate_image' && out?.ok && out.url && onImage) {
          logEvent('llm.stream', 'image_emitted', { clientId, url: out.url });
          onImage(out.url, out.prompt || '');
        }
        break;
      }
      case 'finish':
        lastFinishReason = part.finishReason || 'stop';
        logEvent('llm.stream', 'finish', { clientId, finishReason: lastFinishReason, usage: part.usage });
        break;
      case 'error':
        logEvent('llm.stream.error', part.error?.message || 'unknown', { clientId });
        throw new Error(part.error?.message || 'Stream error');
      default:
        logEvent('llm.stream', 'other_chunk', { clientId, type: part.type });
        break;
    }
  }

  logEvent('llm', 'stream_end', {
    clientId,
    totalMs: Date.now() - t0,
    textChars: textAccum.length,
    reasoningChars: reasoningAccum.length,
    textDeltas: textDeltaCount,
    reasoningDeltas: reasoningDeltaCount,
    toolCalls: toolCallCount,
    toolResults: toolResultCount,
    finishReason: lastFinishReason,
  });

  if (onFinish) onFinish({ reason: lastFinishReason });

  return {
    text: textAccum,
    reasoning: reasoningAccum,
    finishReason: lastFinishReason,
    toolCallCount,
    response: await result.response,
  };
}
