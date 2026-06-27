# Agent UI

Giao diện chat React cho AI Agent. Kết nối tới backend Node.js qua WebSocket để nhận streaming thinking + content.

## Chạy
```bash
cd ui
npm install
npm run dev
# mở http://localhost:5173
```

UI sẽ tự proxy `/api` và `/ws` sang `http://localhost:4000`. Đảm bảo backend `api/` đang chạy.

## Biến môi trường
- `VITE_API_BASE`: URL backend (mặc định rỗng — dùng proxy Vite).
- `VITE_WS_URL`: URL WebSocket (mặc định `ws://<host>:4000`).

## Tính năng
- Streaming thinking với typing animation giống Cursor.
- Thinking cũ fade và scroll lên khi có thinking mới (đóng khi `respond`).
- 🎤 Micro: Web Speech API (vi-VN).
- 📎 Upload file: CSV/Excel/PDF/TXT.
- 🎨 Hiển thị ảnh AI.
- Tool chip hiển thị tool đang chạy (✓ thành công, ⛔ bị chặn, ✗ lỗi).
