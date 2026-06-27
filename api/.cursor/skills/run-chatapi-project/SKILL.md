---
name: run-chatapi-project
description: Chạy project ChatAPI với kiểm tra port 3000 tự động. Sử dụng khi user yêu cầu chạy, khởi động, start hoặc dev dự án ChatAPI. Tự động kill process cũ trên port 3000 trước khi khởi chạy.
---

# Chạy Project ChatAPI

## Quy Trình Chạy Dự Án

### Bước 1: Kiểm tra và Kill port 3000

Trước khi khởi chạy, luôn kiểm tra và kill any process đang chạy trên port 3000:

```bash
# Windows - Sử dụng lệnh tìm và kill process
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %a

# Hoặc sử dụng PowerShell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

### Bước 2: Khởi chạy Dev Server

```bash
cd d:/ChatAppLikeZalo/ChatAPI && npm run dev
```

### Bước 3: Thông báo cho User

Sau khi khởi chạy thành công, thông báo cho user:
- Ứng dụng đã được khởi chạy
- URL truy cập (http://localhost:3000)

## Tóm tắt lệnh

```bash
# Kill port 3000 (Windows)
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %a

# Chạy dev server
cd d:/ChatAppLikeZalo/ChatAPI && npm run dev
```

## Lưu ý

- Luôn thực hiện kill port **trước** khi chạy `npm run dev`
- Không bỏ qua bước kiểm tra port
- Nếu có lỗi khi kill, vẫn tiếp tục thử chạy dev server (port có thể đã được giải phóng)
