// tools/index.js — Vercel AI SDK tool registry.
//
// Each module exports a `tool()` definition compatible with the AI SDK's
// `streamText` / `generateText` (description + zod parameters + execute).
// `buildTools()` returns the object map used by `llmService.streamChat`.
import { execTool } from './execTool.js';
import { readFileTool } from './readFileTool.js';
import { writeFileTool } from './writeFileTool.js';
import { searchWebTool } from './searchWebTool.js';
import { generateImageTool } from './generateImageTool.js';
import { processFileTool } from './processFileTool.js';

const TOOLS = {
  exec: execTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  search_web: searchWebTool,
  generate_image: generateImageTool,
  process_file: processFileTool,
};

export function buildTools() {
  return TOOLS;
}

export const TOOL_NAMES = Object.keys(TOOLS);