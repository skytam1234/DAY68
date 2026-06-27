// server.js — Express + Socket.IO entry point.
// Wires: controllers (I/O) → services (logic) → tools (executors).
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import 'dotenv/config';

import { config } from './config.js';
import { SAFETY_INFO } from './services/safetyService.js';
import { logEvent } from './services/loggerService.js';
import { attachSocketController } from './controllers/socketController.js';
import { handleChat } from './controllers/chatController.js';
import { handleUpload, uploadMiddleware } from './controllers/uploadController.js';
import { registerTool } from './controllers/chatController.js';

// --- Ensure data directories exist ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
for (const d of [config.paths.workspace, config.paths.uploads, config.paths.logs]) {
  ensureDir(d);
}

// --- Register tools ---
import { buildTools } from './services/tools/index.js';
const tools = buildTools();
for (const [name, t] of Object.entries(tools)) {
  registerTool(name, { execute: t.execute });
}
logEvent('server', 'tools_registered', { count: Object.keys(tools).length, names: Object.keys(tools) });

// --- Express app ---
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: config.llm.model,
    hasKey: !!config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    safety: SAFETY_INFO,
    tools: Object.keys(tools),
    transport: 'socket.io',
  });
});

app.post('/api/chat', handleChat);
app.post('/api/upload', uploadMiddleware, handleUpload);

// --- HTTP + Socket.IO server ---
const httpServer = http.createServer(app);
attachSocketController(httpServer, { corsOrigin: true });

httpServer.listen(config.port, () => {
  logEvent('server', 'start', { port: config.port, model: config.llm.model });
  console.log('Agent API listening on http://localhost:' + config.port);
  console.log('Socket.IO:  http://localhost:' + config.port + ' (path: /socket.io)');
  console.log('Model: ' + config.llm.model);
  console.log('Tools: ' + Object.keys(tools).join(', '));
});