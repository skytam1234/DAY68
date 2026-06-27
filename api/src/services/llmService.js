// llmService.js — Direct OpenRouter (OpenAI-compatible) chat completions via fetch.
// Streams SSE chunks, parses tool_calls, manages a tool-execution loop here
// (no Vercel AI SDK dependency).
import { config } from '../config.js';
import { buildTools } from './tools/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Build the OpenAI-style `tools` array from project tool definitions.
 * buildTools() already exposes { description, params } per tool.
 */
function buildOpenAITools() {
  const tools = buildTools();
  return Object.entries(tools).map(([name, t]) => ({
    type: 'function',
    function: {
      name,
      description: t.description || '',
      parameters: t.params || { type: 'object', properties: {} },
    },
  }));
}

/**
 * Try to parse `arguments` for a tool call. OpenRouter returns it as a JSON
 * string; some models produce partial / malformed JSON.
 */
function parseToolArgs(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'string') return raw || {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

/**
 * Stream a single chat completion request, yielding parsed events.
 * Yields:
 *   { type: 'reasoning', delta }     — reasoning/thinking chunks
 *   { type: 'content',   delta }     — assistant text chunks
 *   { type: 'tool_call',  name, args, id } — completed tool calls
 *   { type: 'finish',     reason, usage }
 *   { type: 'error',      message, statusCode }
 *
 * @param {{
 *   messages: Array<object>,
 *   system?: string,
 *   tools?: Array<object> | null,
 *   signal?: AbortSignal,
 * }} opts
 */
async function* streamOnce(opts) {
  const { messages, system, tools, signal } = opts;
  const body = {
    model: config.llm.model,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const headers = {
    'Authorization': 'Bearer ' + config.llm.apiKey,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:4000',
    'X-Title': 'DAY68 Agent',
  };

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    yield { type: 'error', message: 'Network error: ' + e.message };
    return;
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    yield { type: 'error', message: `OpenRouter ${res.status}: ${detail.slice(0, 500)}`, statusCode: res.status };
    return;
  }

  if (!res.body) {
    yield { type: 'error', message: 'No response body' };
    return;
  }

  // SSE parsing state
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  // Tool calls accumulate across the stream because the model may emit the
  // function name early and arguments in pieces.
  const toolCallAccum = new Map(); // index -> { id, name, args }

  for await (const chunk of res.body) {
    if (signal?.aborted) break;
    buffer += decoder.decode(chunk, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const eventBlock = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const lines = eventBlock.split('\n');
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      if (dataLine === '[DONE]') {
        yield { type: 'finish', reason: 'stop' };
        return;
      }

      let evt;
      try { evt = JSON.parse(dataLine); } catch { continue; }

      const choice = evt.choices?.[0];
      const delta = choice?.delta;

      // Reasoning (Nemotron / DeepSeek R1 etc. emit reasoning_details).
      if (delta?.reasoning) {
        yield { type: 'reasoning', delta: delta.reasoning };
      }
      // Some providers split reasoning into reasoning_details[].text.
      const rd = delta?.reasoning_details;
      if (Array.isArray(rd)) {
        for (const r of rd) {
          if (r?.text) yield { type: 'reasoning', delta: r.text };
        }
      }

      if (delta?.content) {
        yield { type: 'content', delta: delta.content };
      }

      // Tool calls (streamed in pieces).
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          let acc = toolCallAccum.get(idx);
          if (!acc) {
            acc = { id: tc.id || '', name: '', args: '' };
            toolCallAccum.set(idx, acc);
          }
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }

      // Stream end signals
      if (choice?.finish_reason) {
        // Yield any completed tool calls before the finish event
        for (const [idx, acc] of [...toolCallAccum.entries()].sort((a, b) => a[0] - b[0])) {
          if (acc.name) {
            yield {
              type: 'tool_call',
              id: acc.id || `tc_${idx}_${Date.now()}`,
              name: acc.name,
              args: parseToolArgs(acc.args),
            };
          }
        }
        toolCallAccum.clear();
        yield {
          type: 'finish',
          reason: choice.finish_reason,
          usage: evt.usage,
        };
        return;
      }
    }
  }
}

/**
 * Public API: run a chat with automatic tool-call loop.
 * Drives the same callbacks the old SDK-driven `streamChat` exposed.
 *
 * @param {{
 *   system?: string,
 *   messages: Array<object>,
 *   signal?: AbortSignal,
 *   onThinking?: (delta: string) => void,
 *   onChunk?: (delta: string) => void,
 *   onToolCall?: (name: string, args: object, id?: string) => void,
 *   onToolResult?: (name: string, result: object, id?: string) => void,
 *   onFinish?: (info: { reason: string, usage?: object }) => void,
 * }} opts
 */
export async function streamChat(opts) {
  const { system, messages, signal, onThinking, onChunk, onToolCall, onToolResult, onFinish } = opts;
  const tools = buildOpenAITools();
  // Mutable working copy of the message history (tool results get appended).
  const history = [...messages];
  const MAX_STEPS = config.limits.agentMaxTurns || 10;
  let finalFinish = null;
  let clientId = null; // passed in via opts? we read from signal — actually we don't have it; tools get ctx from runAgent

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) return;

    // Accumulate this step's assistant message so we can append it to history
    let textBuf = '';
    let reasoningBuf = '';
    const toolCallsThisStep = [];

    for await (const evt of streamOnce({ system, messages: history, tools, signal })) {
      if (signal?.aborted) return;

      if (evt.type === 'reasoning') {
        reasoningBuf += evt.delta;
        if (onThinking) onThinking(evt.delta);
      } else if (evt.type === 'content') {
        textBuf += evt.delta;
        if (onChunk) onChunk(evt.delta);
      } else if (evt.type === 'tool_call') {
        toolCallsThisStep.push({ id: evt.id, name: evt.name, args: evt.args });
        if (onToolCall) onToolCall(evt.name, evt.args, evt.id);
      } else if (evt.type === 'finish') {
        finalFinish = { reason: evt.reason, usage: evt.usage };
      } else if (evt.type === 'error') {
        throw new Error(evt.message);
      }
    }

    // Append assistant message to history (OpenAI chat completions requires
    // assistant message preceding tool results).
    if (toolCallsThisStep.length > 0) {
      history.push({
        role: 'assistant',
        content: textBuf || null,
        tool_calls: toolCallsThisStep.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // Execute each tool and append tool messages.
      const toolsMap = buildTools();
      for (const tc of toolCallsThisStep) {
        if (signal?.aborted) return;
        const tool = toolsMap[tc.name];
        let result;
        try {
          const ctx = { clientId: clientId || 'unknown' };
          result = await tool.execute(tc.args, ctx);
        } catch (e) {
          result = { ok: false, error: e.message };
        }
        if (onToolResult) onToolResult(tc.name, result, tc.id);
        history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      // Continue the loop — let the model see tool results.
      continue;
    }

    // No tool calls: model is done for this turn.
    if (textBuf) {
      history.push({ role: 'assistant', content: textBuf });
    }
    break;
  }

  if (onFinish && finalFinish) {
    onFinish(finalFinish);
  }
}