# PestGuard Pro — Pest Control Dashboard

Frontend là một file tĩnh (`index.html`) chạy trên **GitHub Pages**; dữ liệu dùng chung lưu trên **Cloudflare Worker + D1** (`backend/`).

- Ai có link đều **xem** được dashboard.
- **Sửa / nhập / xóa** dữ liệu và CAPA cần **mã quản trị** (nhập trong *Settings → Server / Đồng bộ dữ liệu*). Mã được lưu trong trình duyệt của người nhập.
- Không cấu hình server thì app chạy như cũ, chỉ lưu trong `localStorage`.

## 1. Deploy backend (Cloudflare)

Cần Node.js 18+ và tài khoản Cloudflare (gói Free đủ dùng).

```bash
cd backend
npm install
npx wrangler login                       # mở trình duyệt để đăng nhập Cloudflare
npx wrangler d1 create pestguard-db      # copy database_id in ra vào wrangler.toml
npm run db:init:remote                   # tạo bảng
npx wrangler secret put ADMIN_KEY        # nhập mã quản trị (chuỗi dài, ngẫu nhiên)
npx wrangler deploy                      # in ra URL https://pestguard-api.<tên>.workers.dev
```

Nếu dùng domain khác cho frontend, thêm nó vào `ALLOWED_ORIGINS` trong `backend/wrangler.toml` rồi `npx wrangler deploy` lại.

## 2. Nối frontend với backend

Mở `index.html`, đặt URL Worker vào `DEFAULT_API_BASE`:

```js
const DEFAULT_API_BASE = 'https://pestguard-api.dangthanhbinh53.workers.dev';
```

## 3. Bật GitHub Pages

Repo → **Settings → Pages** → *Source: Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
Trang sẽ có tại `https://binhfoodsafety.github.io/PestControl_Dashboard/`.

Lần đầu: mở trang → Settings → nhập mã quản trị → **Lưu & kiểm tra**. Nếu muốn đưa dữ liệu đang có trên máy lên server, bấm **Đẩy dữ liệu hiện tại lên server**.

## API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/health` | công khai | kiểm tra Worker + DB |
| GET | `/api/data` | công khai | `{ records, capa, updatedAt }` |
| GET | `/api/auth` | mã quản trị | 204 nếu mã đúng |
| PUT | `/api/records` | mã quản trị | thay toàn bộ bản ghi |
| PUT | `/api/capa` | mã quản trị | thay toàn bộ CAPA |

Mã quản trị gửi qua header `Authorization: Bearer <ADMIN_KEY>`.

## Chạy local

```bash
cd backend
echo ADMIN_KEY=dev-local-key > .dev.vars
npm run db:init:local
npm run dev                              # API tại http://localhost:8787
```

Mở frontend qua một server tĩnh ở cổng 8080 (vd. `npx http-server -p 8080` ở thư mục gốc), vào Settings đặt API URL `http://localhost:8787`.

## Lưu ý

- Mỗi lần lưu, app gửi **toàn bộ** bảng lên server (ghi đè). Nếu hai người quản trị sửa cùng lúc, người lưu sau sẽ ghi đè người lưu trước — nên bấm *Tải lại từ server* trước khi sửa.
- Điểm Audit (BRCGS / FSSC / AIB) trong dashboard được suy ra từ Risk Score, không phải điểm đánh giá thực tế.
