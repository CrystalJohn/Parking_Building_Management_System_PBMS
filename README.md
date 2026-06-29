<br />
<div align="center">
  <h3 align="center">Parking Building Management System (PBMS)</h3>
  <p align="center">
    Hệ thống quản lý tòa nhà đỗ xe thông minh — tự động phân bổ slot, tính phí, đặt chỗ trước, thanh toán VNPAY, và báo cáo vận hành.
  </p>
</div>

---

## About The Project

Hệ thống quản lý tòa nhà đỗ xe đa tầng, xử lý:

- **Check-in / Check-out** xe tại cổng (Staff thao tác qua web)
- **Smart Slot Allocation** — thuật toán phân bổ slot cân bằng tải giữa các tầng
- **Tính phí tự động** — làm tròn theo giờ, phụ thu overtime & mất vé
- **Đặt chỗ trước** (Reservation) cho Driver đã đăng ký
- **QR Code** — Driver nhận QR khi check-in, Staff scan QR khi check-out
- **OCR biển số** — nhận diện biển số xe tự động tại cổng
- **Thanh toán VNPAY** — Bank QR / thẻ quốc tế (Flow 4B)
- **Báo cáo** doanh thu, lưu lượng, occupancy cho Manager
- **Quản lý user & role** (Admin, Manager, Staff, Driver)

**Thông số tòa nhà:**

| | |
|---|---|
| Số tầng | 3 (T1, T2, T3) |
| Zone A (ô tô) | 10 slot/tầng → 30 slot |
| Zone B (xe máy) | 20 slot/tầng → 60 slot |
| Tổng | 90 slot |

---

## Built With

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (Node.js) |
| Frontend | React + Vite + Tailwind CSS |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Auth | JWT (passport-jwt) |
| Payment | VNPAY sandbox |
| Mobile | React Native (Expo) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **PostgreSQL 16** (local install — không cần Docker)
- **ngrok** (cho VNPAY IPN callback khi dev local)

### Installation

1. **Clone repo**

   ```sh
   git clone <repo-url>
   cd Parking_Building_Management_System_PBMS
   ```

2. **Cài dependencies (root + tất cả workspaces)**

   ```sh
   npm install
   cd apps/web && npm install
   cd ../mobile && npm install
   ```

3. **Tạo file `.env` cho API**

   ```sh
   copy .env.example apps/api/.env
   ```

   Chỉnh sửa các giá trị sau trong `apps/api/.env`:

   ```dotenv
   DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/parking_db
   JWT_SECRET=<strong-random-secret>
   ```

4. **Tạo database và chạy migration**

   ```sh
   # Tạo database (chỉ lần đầu)
   psql -U postgres -c "CREATE DATABASE parking_db;"

   # Chạy migrations
   npm run db:migrate --workspace=apps/api

   # Seed dữ liệu mẫu
   npm run db:seed --workspace=apps/api
   ```

5. **Generate Prisma Client**

   ```sh
   npm run db:generate --workspace=apps/api
   ```

6. **Khởi động backend**

   ```sh
   npm start --workspace=apps/api
   ```

   API chạy tại `http://localhost:3001`

7. **Khởi động frontend**

   ```sh
   npm run dev --workspace=apps/web
   ```

   Web chạy tại `http://localhost:3000`

---

## Usage

### Tài khoản mặc định (sau khi seed)

| Role | Phone | Password |
|------|-------|----------|
| Admin | `0900000001` | `password123` |
| Manager | `0900000002` | `password123` |
| Staff | `0900000003` | `password123` |

### Bảng giá mặc định

| Loại xe | Phí/giờ | Phụ thu overtime | Phụ thu mất vé |
|---------|---------|-----------------|----------------|
| Ô tô | 20.000đ | 50.000đ | 100.000đ |
| Xe máy | 10.000đ | 50.000đ | 100.000đ |

### Frontend Pages

| Path | Role | Chức năng |
|------|------|-----------|
| `/login` | All | Đăng nhập |
| `/staff/gate` | Staff | Check-in / Check-out / Thanh toán |
| `/staff/lost-ticket` | Staff | Xử lý mất vé |
| `/staff/gate?tab=check-out&sessionCode=<code>` | Staff | Mở trực tiếp tab Check-out và tự load phiên theo session code |
| `/manager/dashboard` | Manager | Bản đồ slot real-time |
| `/manager/reports` | Manager | Báo cáo doanh thu/lưu lượng |
| `/manager/config` | Manager | Cấu hình giá & chiến lược phân bổ |
| `/admin/users` | Admin | Quản lý tài khoản |
| `/driver/home` | Driver | Xem slot trống & giá |
| `/driver/reservations` | Driver | Đặt/hủy chỗ |
| `/driver/my-session` | Driver | QR code check-out |

### API Endpoints chính

| Method | Endpoint | Mô tả | Role |
|--------|----------|--------|------|
| POST | `/auth/login` | Đăng nhập | All |
| POST | `/auth/register` | Driver tự đăng ký | Public |
| POST | `/sessions/check-in` | Check-in xe | Staff |
| POST | `/sessions/check-out` | Check-out, tính phí | Staff |
| GET | `/sessions/checkout-lookup?sessionCode=...` | Tra cứu phiên để Check-out theo session code/id | Staff |
| GET | `/sessions/checkout-lookup?licensePlate=...` | Tra cứu phiên để Check-out theo biển số | Staff |
| POST | `/sessions/:id/confirm-payment` | Xác nhận tiền mặt | Staff |
| POST | `/sessions/:id/confirm-exit` | Xác nhận xe ra, release slot | Staff |
| POST | `/sessions/:id/payments/bank-qr` | Tạo VNPAY payment URL | Staff |
| GET | `/sessions/:id/payment-status` | Trạng thái thanh toán | Staff |
| POST | `/tickets/lost` | Ghi nhận mất vé, lưu thông tin xác minh và áp phí mất vé | Staff |
| GET | `/payments/vnpay/return` | VNPAY return callback | Public |
| GET | `/payments/vnpay/ipn` | VNPAY IPN server-to-server | Public |
| GET | `/users` | Quản lý user | Admin |

---

## VNPAY Integration (Flow 4B)

### Setup

1. Đăng ký sandbox tại https://sandbox.vnpayment.vn/devreg/
2. Cài ngrok: `winget install ngrok.ngrok`

### Khởi động ngrok

Trước khi test VNPAY payment, khởi động ngrok để expose local API ra internet (VNPAY cần gọi callback từ IPN server):

```sh
# Terminal riêng
ngrok http 3001
```

Output sẽ hiển thị:
```
Forwarding                    https://<random-id>.ngrok.io -> http://localhost:3001
```

**Lưu ý:** Mỗi lần restart ngrok, URL sẽ khác. Cần cập nhật `VNPAY_RETURN_URL` và `VNPAY_IPN_URL` trong `.env`.

### Cấu hình VNPAY env

3. Điền vào `apps/api/.env`:

```dotenv
VNPAY_TMN_CODE=<TMN Code từ VNPAY portal>
VNPAY_HASH_SECRET=<Secret Key từ VNPAY portal>
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://<ngrok-url>/payments/vnpay/return
VNPAY_IPN_URL=https://<ngrok-url>/payments/vnpay/ipn
VNPAY_VERSION=2.1.0
VNPAY_ORDER_TYPE=other
# Để trống = hiện tất cả phương thức. VNPAY_BANK_CODE=NCB để force ATM nội địa
VNPAY_BANK_CODE=
```

**Thẻ quốc tế Visa (không có minimum):**

| Field | Giá trị |
|-------|---------|
| Số thẻ | `4456530000001005` |
| Ngày hết hạn | `10/26` |
| CVV | `123` |

**Thẻ ATM nội địa NCB (minimum 10.000đ):**

| Field | Giá trị |
|-------|---------|
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| OTP | `123456` |

### Checkout lifecycle (bất biến)

```
active → checkout_pending → exit_authorized → completed
                ↑                  ↑
         (check-out)        (VNPAY paid /
                             cash confirmed)

Slot: occupied → occupied → occupied → available
                                           ↑
                                    (confirm-exit only)
```

### Lost Ticket handoff

Khi Staff xử lý mất vé tại `/staff/lost-ticket`, hệ thống:

1. Tra cứu đúng active session theo biển số.
2. Ghi nhận `isLostTicket`, số CCCD/ID card và số GPLX đã xác minh.
3. Tính lại phí với phụ thu mất vé.
4. Giữ nguyên session ở trạng thái `active`; xe vẫn đang chiếm slot.
5. Nút **Open Gate checkout** chuyển sang `/staff/gate?tab=check-out&sessionCode=<code>`.
6. Gate tự điền session code và tự load phiên checkout để Staff tiếp tục tính phí, thu tiền và xác nhận xe ra.

Lost Ticket không tự hoàn tất checkout, không tự release slot, và không thay thế các bước `check-out → confirm-payment → confirm-exit`.

---

## Project Structure

```
Parking_Building_Management_System_PBMS/
├── apps/
│   ├── api/                    # NestJS Backend (port 3001)
│   │   ├── prisma/             # Schema, migrations, seed
│   │   └── src/
│   │       ├── auth/           # JWT, guards, decorators
│   │       ├── sessions/       # Check-in/out lifecycle
│   │       ├── payments/       # VNPAY integration
│   │       ├── slots/          # Slot management + allocation
│   │       ├── reservations/   # Driver reservations
│   │       ├── fees/           # Fee calculation
│   │       ├── reports/        # Revenue & traffic reports
│   │       ├── ocr/            # Plate recognition
│   │       └── users/          # User CRUD (Admin)
│   ├── web/                    # Vite + React + Tailwind (port 3000)
│   │   └── src/
│   │       ├── pages/          # Route pages by role
│   │       ├── components/     # Shared UI components
│   │       └── lib/            # API client, auth utils
│   └── mobile/                 # React Native / Expo
├── .env.example                # Template env vars
├── docker-compose.yml          # PostgreSQL + pgAdmin (optional)
└── package.json                # Workspace root
```

---

## Roadmap

- [x] Flow 1 — Walk-in check-in, smart slot allocation, QR ticket
- [x] Flow 2 — Reservation (Driver đặt chỗ trước)
- [x] Flow 3 — OCR-assisted Staff check-in
- [x] Flow 4A — Cash checkout lifecycle
- [x] Flow 4B — VNPAY Bank QR / thẻ quốc tế checkout
- [x] Role-based access control (Admin / Manager / Staff / Driver)
- [x] Manager dashboard & reports
- [x] Admin user management
- [ ] Mobile app (React Native) — Driver flows

---

## License

Distributed under the MIT License.
