// execTool.js — Shell execution with safety checks.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { config } from '../../config.js';
import { isDangerousCommand } from '../safetyService.js';
import { logExec } from '../loggerService.js';

const pexec = promisify(exec);

function pickShell() {
  if (process.platform !== 'win32') return '/bin/sh';
  const candidates = process.env.ComSpec
    ? [process.env.ComSpec]
    : ['C:\\Windows\\System32\\cmd.exe', 'C:\\WINDOWS\\System32\\cmd.exe', 'cmd.exe'];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return 'cmd.exe';
}

export const definition = {
  name: 'exec',
  description: 'Chạy lệnh shell an toàn trong workspace.',
  params: {
    type: 'object',
    properties: { cmd: { type: 'string' } },
    required: ['cmd'],
  },
};

export async function execute({ cmd }, ctx) {
  const check = isDangerousCommand(cmd);
  if (check.blocked) {
    logExec({ clientId: ctx.clientId, cmd, blocked: true, reason: check.reason });
    return { ok: false, blocked: true, reason: 'blocked: ' + check.reason };
  }
  const started = Date.now();
  try {
    const { stdout, stderr } = await pexec(cmd, {
      cwd: config.paths.workspace,
      timeout: config.limits.execTimeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: pickShell(),
    });
    logExec({ clientId: ctx.clientId, cmd, stdout, stderr, ms: Date.now() - started });
    return { ok: true, stdout: stdout?.toString() || '', stderr: stderr?.toString() || '', ms: Date.now() - started };
  } catch (e) {
    logExec({
      clientId: ctx.clientId, cmd,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      code: e.code, ms: Date.now() - started,
    });
    return { ok: false, error: e.message, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.code };
  }
}
