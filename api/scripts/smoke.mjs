// scripts/smoke.mjs — End-to-end smoke test using socket.io-client.
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:4000';
const PROMPT = process.argv.slice(2).join(' ') || 'vẽ cho tôi lá cờ việt nam';

const events = {};

const socket = io(URL, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnection: false,
});

socket.on('connect', () => console.log('[connect]', socket.id));
socket.on('connect_error', (e) => console.log('[connect_error]', e.message));
socket.on('connected', (d) => {
  console.log('[connected clientId]', d.clientId);
  kickOff(d.clientId).catch((e) => console.log('[kickOff err]', e.message));
});
socket.on('thinking', () => bump('thinking'));
socket.on('content', (d) => { bump('content'); process.stdout.write(d.delta || ''); });
socket.on('tool_call', (d) => { bump('tool_call'); console.log('\n[tool_call]', d.name, JSON.stringify(d.params || {})); });
socket.on('tool_result', (d) => { bump('tool_result'); console.log('[tool_result]', d.name, JSON.stringify(d.result).slice(0, 250)); });
socket.on('image', (d) => { bump('image'); console.log('\n[image]', d.url); });
socket.on('respond', (d) => { bump('respond'); console.log('\n[respond]', (d.answer || '').slice(0, 250)); });
socket.on('error', (d) => { bump('error'); console.log('\n[error]', d?.message); });
socket.on('done', () => { bump('done'); console.log('\n[done]'); finish(); });

function bump(name) { events[name] = (events[name] || 0) + 1; }

async function kickOff(clientId) {
  const r = await fetch(URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      messages: [{ role: 'user', content: PROMPT }],
    }),
  });
  console.log('\n[POST /api/chat]', r.status, await r.text());
}

function finish() {
  setTimeout(() => {
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(events, null, 2));
    socket.close();
    process.exit(0);
  }, 300);
}

setTimeout(() => {
  console.log('\n[TIMEOUT]');
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(events, null, 2));
  socket.close();
  process.exit(0);
}, 120000);