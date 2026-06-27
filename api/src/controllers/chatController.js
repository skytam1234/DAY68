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
  const { clientId, messages } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });

  if (!getSocketClient(clientId)) {
    return res.status(400).json({ error: 'client not connected via Socket.IO' });
  }

  logEvent('chat', 'start', { clientId, turns: messages.length });
  res.json({ ok: true, queued: true });

  const wsEntry = getSocketClient(clientId);
  if (wsEntry?.agentAbort) wsEntry.agentAbort.abort();

  const abortCtrl = new AbortController();
  setAgentAbort(clientId, abortCtrl);

  const callbacks = {
    onThinking: (delta) => sendToClient(clientId, 'thinking', { delta }),
    onContent: (delta) => sendToClient(clientId, 'content', { delta }),
    onToolCall: (name, params) => sendToClient(clientId, 'tool_call', { name, params }),
    onToolResult: (name, result) =>
      sendToClient(clientId, 'tool_result', { name, params: {}, result }),
    onImage: (url, prompt) => sendToClient(clientId, 'image', { url, prompt }),
    onRespond: (answer, images) => sendToClient(clientId, 'respond', { answer, images }),
    onError: (message) => {
      logEvent('agent.error', message, { clientId });
      sendToClient(clientId, 'error', { message });
    },
    onTurnStart: (turn) => sendToClient(clientId, 'turn_start', { turn }),
  };

  try {
    await runAgent({
      clientId,
      history: messages,
      callbacks,
      signal: abortCtrl.signal,
    });
    sendToClient(clientId, 'done', {});
    logEvent('chat', 'done', { clientId });
  } catch (e) {
    if (e.name === 'AbortError' || e.code === 'ABORT_ERR') {
      logEvent('chat', 'aborted', { clientId });
      return;
    }
    logEvent('chat.error', e.message, { clientId });
    sendToClient(clientId, 'error', { message: e.message });
  } finally {
    setAgentAbort(clientId, null);
  }
}