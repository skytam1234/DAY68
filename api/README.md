# Agent API

Backend Node.js cho AI Agent với WebSocket streaming thinking, web search, image generation, và sandbox an toàn.

## Chạy
```bash
cd api
cp .env.example .env  # chỉnh OPENROUTER_API_KEY, model, base URL
npm install
npm run dev
```

Server: `http://localhost:4000`
Socket.IO: `ws://localhost:4000/socket.io`

### Model mặc định

`openai/gpt-oss-20b:free` — model OpenAI mới, free trên OpenRouter, hỗ trợ tool calling ổn định.

Các model free khác có thể dùng qua biến `LLM_MODEL` trong `.env`:
- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen3-coder:free`
- `openrouter/free` (router tự chọn free model phù hợp với tool calling)

## Endpoints
- `GET /api/health` — kiểm tra trạng thái + config.
- `POST /api/chat` — body `{ clientId, messages: [{role, content}] }`. Server sẽ stream sự kiện về qua WS.
- `POST /api/upload` — multipart `file` → trả `{ path, name, size }`.

## Sự kiện WebSocket
- `connected { clientId }`
- `agent_start`
- `turn_start { turn }`
- `thinking { delta }` — stream từng phần reasoning_content.
- `content { delta }` — stream từng phần nội dung.
- `tool_call { name, params }` / `tool_result { name, params, result }`
- `image { url, prompt }` — URL ảnh do `generate_image` tạo.
- `respond { answer, images? }` — kết thúc.
- `error { message }`

## Tools
- `exec(cmd)` — có blacklist lệnh nguy hiểm.
- `read_file(path, max_bytes)` — whitelist workspace/uploads.
- `write_file(path, content)` — whitelist + size limit.
- `search_web(query)` — DuckDuckGo HTML scrape.
- `generate_image(prompt)` — Pollinations.ai (free).
- `process_file(path, operation)` — Excel/CSV/PDF/TXT.

## An toàn
- Tất cả file ops bị giới hạn trong `WORKSPACE_DIR` và `UPLOADS_DIR`.
- Lệnh exec khớp blacklist (`rm -rf`, `format`, `shutdown`, ...) bị từ chối.
- Mọi file/exec được log vào `data/logs/`.
