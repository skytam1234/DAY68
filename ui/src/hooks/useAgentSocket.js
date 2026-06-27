// useAgentSocket.js - Socket.IO hook connecting to the agent backend.
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || '';
// For Socket.IO we connect to the same HTTP origin (no separate port).
// VITE_SOCKET_URL can override.
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (API_BASE ? API_BASE : `${location.protocol}//${location.hostname}:4000`);

export function useAgentSocket() {
  const [clientId, setClientId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [currentContent, setCurrentContent] = useState('');
  const [toolEvents, setToolEvents] = useState([]);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);
  const [turn, setTurn] = useState(0);
  const socketRef = useRef(null);
  const finalResolveRef = useRef(null);

  useEffect(() => {
    let stopped = false;
    let retryDelay = 500;

    function connect() {
      if (stopped) return;
      const socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: false, // we manage our own backoff
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        retryDelay = 500;
      });

      socket.on('disconnect', (reason) => {
        setConnected(false);
        if (!stopped) {
          setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 8000);
        }
      });

      socket.on('connect_error', () => {
        setConnected(false);
        if (!stopped) {
          setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 8000);
        }
      });

      // Initial handshake from server
      socket.on('connected', (data) => {
        if (data?.clientId) setClientId(data.clientId);
      });

      // Server-pushed agent events
      socket.on('turn_start', (data) => {
        setTurn(data.turn);
        setCurrentContent('');
        setCurrentThinking('');
        setToolEvents([]);
        setImages([]);
        setStreaming(true);
      });

      socket.on('thinking', (data) => {
        setCurrentThinking((p) => p + (data.delta || ''));
      });

      socket.on('content', (data) => {
        setCurrentContent((p) => p + (data.delta || ''));
      });

      socket.on('tool_call', (data) => {
        setToolEvents((p) => [...p, { type: 'call', name: data.name, params: data.params }]);
      });

      socket.on('tool_result', (data) => {
        setToolEvents((p) => {
          const idx = p.findIndex((e) => e.type === 'call' && e.name === data.name && !e.result);
          if (idx >= 0) {
            const next = p.slice();
            next[idx] = { ...next[idx], result: data.result };
            return next;
          }
          return [...p, { type: 'result', name: data.name, result: data.result }];
        });
      });

      socket.on('image', (data) => {
        setImages((p) => [...p, { url: data.url, prompt: data.prompt }]);
      });

      socket.on('respond', (data) => {
        setTranscript((p) => p + (data.answer || ''));
        setStreaming(false);
        if (finalResolveRef.current) {
          finalResolveRef.current({ answer: data.answer, images: data.images || [] });
          finalResolveRef.current = null;
        }
      });

      socket.on('error', (data) => {
        setError(data?.message || 'Lỗi');
        setStreaming(false);
      });

      socket.on('done', () => {
        setStreaming(false);
      });
    }

    connect();
    return () => {
      stopped = true;
      if (socketRef.current) {
        try { socketRef.current.disconnect(); } catch {}
      }
    };
  }, []);

  const sendChat = useCallback(
    (messages) =>
      new Promise((resolve, reject) => {
        if (!clientId) return reject(new Error('Chưa kết nối Socket.IO'));
        finalResolveRef.current = resolve;
        setTranscript('');
        setError(null);
        fetch(API_BASE + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, messages }),
        }).catch((e) => {
          setError(e.message);
          reject(e);
        });
      }),
    [clientId]
  );

  const abortChat = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('abort');
    }
  }, []);

  const uploadFile = useCallback(
    async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('clientId', clientId || '');
      const res = await fetch(API_BASE + '/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    [clientId]
  );

  return {
    clientId,
    connected,
    streaming,
    transcript,
    setTranscript,
    currentThinking,
    currentContent,
    toolEvents,
    images,
    error,
    turn,
    sendChat,
    abortChat,
    uploadFile,
  };
}