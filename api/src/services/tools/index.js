// tools/index.js — Provides tool executor registry + JSON-Schema definitions
// (used by llmService for OpenAI-style function calling and by the agent
// loop for execution). No SDK dependency.
import { execute as execTool, definition as execDef } from './execTool.js';
import { execute as readFileTool, definition as readFileDef } from './readFileTool.js';
import { execute as writeFileTool, definition as writeFileDef } from './writeFileTool.js';
import { execute as searchWebTool, definition as searchWebDef } from './searchWebTool.js';
import { execute as generateImageTool, definition as generateImageDef } from './generateImageTool.js';
import { execute as processFileTool, definition as processFileDef } from './processFileTool.js';

const TOOL_DEFS = [
  { name: 'exec', def: execDef, execute: execTool },
  { name: 'read_file', def: readFileDef, execute: readFileTool },
  { name: 'write_file', def: writeFileDef, execute: writeFileTool },
  { name: 'search_web', def: searchWebDef, execute: searchWebTool },
  { name: 'generate_image', def: generateImageDef, execute: generateImageTool },
  { name: 'process_file', def: processFileDef, execute: processFileTool },
];

/**
 * Returns { name: { execute, description, params } }.
 * The `execute` field is used directly by the agent loop.
 * The `description` and `params` fields are used by llmService to build the
 * OpenAI-style `tools` payload.
 */
export function buildTools() {
  const out = {};
  for (const { name, def, execute } of TOOL_DEFS) {
    out[name] = { execute, description: def.description, params: def.params };
  }
  return out;
}

export function buildToolRegistry() {
  const reg = {};
  for (const { name, execute } of TOOL_DEFS) {
    reg[name] = { execute };
  }
  return reg;
}

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);