// config.js — Centralized configuration.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  llm: {
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b:free',
  },
  paths: {
    workspace: normPath(process.env.WORKSPACE_DIR || './data/workspace'),
    uploads: normPath(process.env.UPLOADS_DIR || './data/uploads'),
    logs: normPath(process.env.LOGS_DIR || './data/logs'),
  },
  limits: {
    maxWriteBytes: parseInt(process.env.MAX_WRITE_BYTES || '5242880', 10),
    execTimeoutMs: parseInt(process.env.EXEC_TIMEOUT_MS || '30000', 10),
    agentMaxTurns: parseInt(process.env.AGENT_MAX_TURNS || '10', 10),
  },
};

function normPath(p) {
  if (path.isAbsolute(p)) return path.normalize(p);
  return path.resolve(apiRoot, p.replace(/^\.\//, ''));
}
