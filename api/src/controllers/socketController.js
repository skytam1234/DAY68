// socketController.js — Socket.IO I/O: connection lifecycle + event routing.
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import { logEvent } from '../services/loggerService.js';

const clients = new Map(); // clientId -> { socket, agentAbort }

/**
 * Attach Socket.IO server to existing HTTP server.
 * @param {import('http').Server} httpServer
 * @param {object} opts — { corsOrigin }
 */
export function attachSocketController(httpServer, opts = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: opts.corsOrigin || true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    const clientId = nanoid(10);
    clients.set(clientId, { socket, agentAbort: null });
    socket.clientId = clientId;
    logEvent('socket', 'client_connected', { clientId });

    // Send initial handshake event
    socket.emit('connected', { clientId });

    // Client signals abort for current agent run
    socket.on('abort', () => {
      const entry = clients.get(clientId);
      if (entry?.agentAbort) {
        entry.agentAbort.abort();
        logEvent('socket', 'agent_aborted', { clientId });
      }
    });

    // Optional: client can change its ID (rarely used)
    socket.on('set_client_id', (id) => {
      if (typeof id === 'string' && id.length <= 64) {
        const oldId = clientId;
        const entry = clients.get(oldId);
        if (entry) {
          clients.delete(oldId);
          socket.clientId = id;
          clients.set(id, entry);
          logEvent('socket', 'client_id_changed', { from: oldId, to: id });
        }
      }
    });

    socket.on('disconnect', (reason) => {
      const entry = clients.get(socket.clientId || clientId);
      if (entry?.agentAbort) {
        try { entry.agentAbort.abort(); } catch {}
      }
      clients.delete(socket.clientId || clientId);
      logEvent('socket', 'client_disconnected', { clientId: socket.clientId || clientId, reason });
    });
  });

  return io;
}

/** Emit an event to a specific client. */
export function sendToClient(clientId, event, data) {
  const entry = clients.get(clientId);
  if (!entry || !entry.socket.connected) {
    logEvent('socket.emit_skip', event, { clientId, reason: !entry ? 'no_entry' : 'not_connected' });
    return false;
  }
  try {
    entry.socket.emit(event, data);
    logEvent('socket.emit', event, {
      clientId,
      payloadSize: data ? JSON.stringify(data).length : 0,
    });
    return true;
  } catch (e) {
    logEvent('socket.emit.error', e.message, { clientId, event });
    return false;
  }
}

export function getSocketClient(clientId) {
  return clients.get(clientId);
}

export function setAgentAbort(clientId, abortCtrl) {
  const entry = clients.get(clientId);
  if (entry) entry.agentAbort = abortCtrl;
}