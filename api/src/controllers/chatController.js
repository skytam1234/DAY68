// chatController.js — Orchestrates agent + tools + Socket.IO events.
import { runAgent } from '../services/agentService.js';
import { sendToClient, setAgentAbort, getSocketClient } from './socketController.js';
import { logEvent } from '../services/loggerService.js';

// Tool registry (populated at startup via registerTool)
const _toolRegistry = new Map();

export function registerTool(name, executor) {
  _toolRegistry.set(name, executor);
}

export function getToolRegistry() {
  return _toolRegistry;
}

/**
 * POST /api/chat — kick off agent for a client.
 * Request body: { clientId, messages }
 */
export async function handleChat(req, res) {
  const t0 = Date.now();
  const { clientId, messages } = req.body || {};
  logEvent('chat.http', 'request_received', {
    clientId: clientId || '(missing)',
    turns: Array.isArray(messages) ? messages.length : 0,
    lastUserMsg: Array.isArray(messages) ? messages.slice(-1)[0]?.content?.slice(0, 200) : null,
  });
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });

  if (!getSocketClient(clientId)) {
    logEvent('chat.http', 'client_not_connected', { clientId });
    return res.status(400).json({ error: 'client not connected via Socket.IO' });
  }

  logEvent('chat.http', 'acknowledged', { clientId, ms: Date.now() - t0 });
  res.json({ ok: true, queued: true });

  const wsEntry = getSocketClient(clientId);
  if (wsEntry?.agentAbort) wsEntry.agentAbort.abort();

  const abortCtrl = new AbortController();
  setAgentAbort(clientId, abortCtrl);

  logEvent('chat', 'start', { clientId, turns: messages.length });

  const callbacks = {
    onThinking: (delta) => {
      logEvent('chat.event', 'thinking', { clientId, len: delta?.length });
      sendToClient(clientId, 'thinking', { delta });
    },
    onContent: (delta) => {
      logEvent('chat.event', 'content', { clientId, len: delta?.length });
      sendToClient(clientId, 'content', { delta });
    },
    onToolCall: (name, params) => {
      logEvent('chat.event', 'tool_call', { clientId, name, params });
      sendToClient(clientId, 'tool_call', { name, params });
    },
    onToolResult: (name, result) => {
      logEvent('chat.event', 'tool_result', { clientId, name, ok: !!result?.ok, summary: result?.error || result?.url || result?.path || null });
      sendToClient(clientId, 'tool_result', { name, params: {}, result });
    },
    onImage: (url, prompt) => {
      logEvent('chat.event', 'image', { clientId, url, promptLen: prompt?.length });
      sendToClient(clientId, 'image', { url, prompt });
    },
    onRespond: (answer, images) => {
      logEvent('chat.event', 'respond', { clientId, answerLen: answer?.length, imageCount: images?.length });
      sendToClient(clientId, 'respond', { answer, images });
    },
    onError: (message) => {
      logEvent('agent.error', message, { clientId });
      sendToClient(clientId, 'error', { message });
    },
    onTurnStart: (turn) => {
      logEvent('chat.event', 'turn_start', { clientId, turn });
      sendToClient(clientId, 'turn_start', { turn });
    },
  };

  try {
    await runAgent({
      clientId,
      history: messages,
      callbacks,
      signal: abortCtrl.signal,
    });
    sendToClient(clientId, 'done', {});
    logEvent('chat', 'done', { clientId, totalMs: Date.now() - t0 });
  } catch (e) {
    if (e.name === 'AbortError' || e.code === 'ABORT_ERR') {
      logEvent('chat', 'aborted', { clientId, totalMs: Date.now() - t0 });
      return;
    }
    logEvent('chat.error', e.message, { clientId, totalMs: Date.now() - t0 });
    sendToClient(clientId, 'error', { message: e.message });
  } finally {
    setAgentAbort(clientId, null);
  }
}