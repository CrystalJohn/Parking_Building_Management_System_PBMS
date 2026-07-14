# Manual E2E Test Script — Pre-Demo Verification

**Mục đích:** đây chính là mục P0.2 trong SRS report của bạn ("Run a manual test script for reservation QR check-in, OCR walk-in check-in, OCR checkout, cash/VNPay payment, and manual exit confirmation"). Checklist này mở rộng đầy đủ hơn, bao phủ cả phần bảo mật vừa sửa (BOLA) và các edge case đã bàn xuyên suốt quá trình làm việc.

**Cách dùng:** làm tuần tự từ Section 0 → 10, tick từng dòng. Nếu 1 dòng fail, dừng lại sửa trước khi qua dòng tiếp theo trong cùng section (vì các bước sau thường phụ thuộc trạng thái đúng của bước trước).

**⚠️ Điều kiện tiên quyết — không bắt đầu Section 1 nếu chưa xong:**
- [ ] Section 0 (môi trường) xanh hết
- [ ] BOLA fix (ownership check `GET /sessions/:id`, `/qr`) đã implement và có e2e test pass — đây là bug bảo mật thật, không phải nice-to-have

---

## Section 0 — Môi trường

- [x] `npx prisma migrate status` — sạch, không còn pending migration
- [x] `npm test --workspace=apps/api` (full suite) — xanh hết, kể cả 3 suite từng fail (`sessions.service.spec.ts`, `reservations.service.spec.ts`, `gate.service.spec.ts` — đã biết nguyên nhân thiếu mock, sửa trước khi demo)
- [ ] `allocation.concurrency.spec.ts` với `PBMS_RUN_DB_INTEGRATION=1` — xanh (bằng chứng concurrency, dùng lại kết quả này, không cần lặp lại thủ công ở Section 10)
- [ ] E2E ownership test (BOLA fix) — xanh
- [ ] VNPay sandbox phản hồi được (thử 1 giao dịch test tay trước, ngoài phạm vi script này)
- [x] Đồng bộ giờ hệ thống (ảnh hưởng cron reservation-expiry và evidence retention)

**Tài khoản cần chuẩn bị sẵn:**

| Tài khoản | Vai trò | Ghi chú |
|---|---|---|
| Driver A | driver | Có 2 xe đã link (1 car, 1 motorbike) — link qua Manager (v1-minimal, không có self-claim) |
| Driver B | driver | Không liên quan gì Driver A — dùng riêng cho test ownership âm tính |
| Staff | staff | Tài khoản gate |
| Manager | manager | |
| Admin | administrator | |

**⚠️ Cần xác nhận trước khi chạy Section 5:** SRS report không nhắc tới `Subscription`/auto-pay trong phần Payment (chỉ có Cash và VNPay Bank QR), dù model `Subscription` có tồn tại trong schema. Nếu auto-pay theo subscription **chưa** thực sự nối vào luồng checkout, bỏ qua case 5.7 (đánh dấu optional bên dưới) — không test tính năng chưa chắc đã có.

---

## Section 1 — Vehicle & Ownership Integrity

- [x] 1.1 Manager link Vehicle X cho Driver A với `role: owner` → thành công
- [x] 1.2 Thử link **cùng Vehicle X** cho Driver C với `role: owner` → bị chặn (partial unique index + `P2002` → message rõ ràng, không phải lỗi 500 thô)
- [x] 1.3 Manager link Vehicle X cho 1 user khác với `role: driver` (không phải owner) → thành công (multi-user/vehicle vẫn hoạt động cho role không phải owner)
- [x] 1.4 Driver B gọi `GET /vehicles/my` → chỉ thấy xe của mình, không thấy xe Driver A

---

## Section 2 — Reservation (Driver App)

- [ ] 2.1 Driver A chọn 1 xe đã link, tạo reservation với `plannedArrivalAt` → slot chuyển `reserved`, reservation `active`
- [ ] 2.2 Driver A thử tạo reservation thứ 2 cho **cùng xe đó** khi reservation 1 còn active → bị chặn (theo đúng rule "neither driver nor vehicle already has active reservation")
- [ ] 2.3 Màn hình reservation hiện QR, quan sát QR **tự đổi** sau ~30s (token xoay)
- [ ] 2.4 Chỉnh `expiresAt` gần hiện tại (test data) → nhận được notification cảnh báo sắp hết hạn
- [ ] 2.5 Để reservation hết hạn hẳn (hoặc chỉnh `expiresAt` về quá khứ) → cron job chạy, reservation chuyển `expired`, slot nhả về `available`

---

## Section 3 — QR-First Check-in (Staff)

- [ ] 3.1 Staff quét QR reservation Driver A → hiện preview đủ: biển số, tên driver, slot, payment info — **verify KHÔNG có network call nào tới OCR provider** (mở tab Network, xác nhận)
- [ ] 3.2 Staff bấm Confirm → reservation `fulfilled`, slot `occupied`, `ParkingSession` tạo với cả `vehicleId` VÀ `reservationId`
- [ ] 3.3 Bấm Confirm **lần 2** cho cùng reservation (giả lập double-click) → trả về đúng session đã tạo, KHÔNG tạo session thứ 2 (idempotent)
- [ ] 3.4 Thử reservation check-in cho 1 xe **đã có session mở ở nơi khác** → bị chặn

---

## Section 4 — Walk-in OCR + Unified Scan

- [ ] 4.1 Staff chụp biển số xe **chưa từng có session** → tự route sang check-in preview, slot được allocate
- [ ] 4.2 Confirm → session tạo, status `active`
- [ ] 4.3 Chụp lại **cùng biển số đó** (giả lập lúc ra) → tự động route sang checkout preview, phí đã tính sẵn — không cần chọn tab nào
- [ ] 4.4 Cố tình để OCR đọc sai, sửa tay biển số đúng → hệ thống re-resolve qua `resolve-plate`, **verify KHÔNG gọi lại OCR** (kiểm tra Network tab, không thấy call thứ 2 tới Plate Recognizer)

---

## Section 5 — Checkout & Payment

- [ ] 5.1 Cash: staff chọn Cash → `checkout_pending` → xác nhận đã nhận tiền → `exit_authorized`
- [ ] 5.2 VNPay (staff tạo QR): staff generate QR, hoàn tất thanh toán sandbox → webhook cập nhật → `exit_authorized`
- [ ] 5.3 VNPay (driver tự trả): khi session ở `checkout_pending`, driver app hiện tùy chọn thanh toán, driver hoàn tất → staff quét lại thấy "sẵn sàng ra", không cần chọn phương thức nữa
- [ ] 5.4 Staff bấm tạo thanh toán VNPay **2 lần liên tiếp** cho cùng session → verify tái sử dụng đúng 1 payment URL đang pending, không tạo 2 payment record
- [ ] 5.5 Staff bấm Confirm Exit → session `completed`, slot `available`
- [ ] 5.6 Thử Confirm Exit **trước khi** thanh toán xong → bị chặn, message rõ ràng
- [ ] 5.7 *(Optional — chỉ chạy nếu đã xác nhận subscription auto-pay có nối vào checkout thật)* Session của xe có subscription active → checkout tự động bỏ qua bước chọn payment method

---

## Section 6 — Lost Ticket & Operational Exceptions

- [ ] 6.1 Giả lập mất vé: staff tìm theo biển số (không có QR/session code), nhập thông tin giấy tờ, đánh dấu `isLostTicket` → checkout tiếp tục được dưới cờ này
- [ ] 6.2 Staff raise 1 `OperationIssue` (vd plate mismatch) → xuất hiện ở Manager queue với status `open`
- [ ] 6.3 Thử raise **issue trùng** cho cùng context/session → bị chặn (duplicate prevention)
- [ ] 6.4 Manager đổi status issue `open` → `in-review` → `resolved` → Manager console cập nhật **real-time qua SSE**, không cần refresh trang

---

## Section 7 — Bảo mật: Ownership Check (BOLA fix — ưu tiên cao nhất hiện tại)

- [ ] 7.1 Driver A tạo 1 session, ghi lại `id`
- [ ] 7.2 Driver B gọi `GET /sessions/:id` với `id` của Driver A → **404** (không phải 403)
- [ ] 7.3 Driver B gọi `GET /sessions/:id/qr` với `id` của Driver A → **404**
- [ ] 7.4 Driver A gọi lại chính session của mình → **200**, dữ liệu đúng
- [ ] 7.5 Staff gọi `GET /sessions/checkout-lookup` cho session bất kỳ → vẫn **200** (fix không làm gãy luồng staff)
- [ ] 7.6 Kiểm tra `GET /reservations/:id` có cùng pattern lỗ hổng không (theo prompt audit đã đưa trước đó — nếu có, áp dụng đúng fix tương tự)

---

## Section 8 — Ranh giới RBAC

- [ ] 8.1 Driver gọi endpoint staff-only (vd `/gate/scan-plate`) → bị chặn bởi `RolesGuard`
- [ ] 8.2 Staff gọi endpoint config Manager-only → bị chặn
- [ ] 8.3 Manager gọi user CRUD (Admin-only) → bị chặn
- [ ] 8.4 User bị deactivate, thử gọi API với JWT cũ (còn hạn) → bị từ chối (theo đúng SRS: "Deactivating a user prevents subsequent authenticated requests")

---

## Section 9 — Evidence Lifecycle

- [ ] 9.1 Check-in scan tạo `OcrEvidence`, hiện được ở màn hình checkout staff (so sánh cạnh nhau check-in vs check-out)
- [ ] 9.2 Manager/Admin mở được evidence qua endpoint protected
- [ ] 9.3 *(Optional, tốn thời gian hơn)* Set 1 evidence record thành hết hạn thủ công trong DB test, chạy cron retention → verify ảnh full+thumbnail bị xoá, metadata vẫn còn (hiển thị "đã hết hạn" thay vì mất luôn context)

---

## Section 10 — Smart Allocation (bằng chứng, không cần lặp lại concurrency thủ công)

- [ ] 10.1 Check-in vài xe liên tiếp, quan sát occupancy dàn đều giữa các zone (không dồn hết vào 1 khu) khi dùng `fair_distance_based` hoặc `balanced_occupancy`
- [ ] 10.2 Manager đổi strategy sang `lowest_floor`, quan sát hành vi allocation đổi theo đúng kỳ vọng (ưu tiên tầng thấp rõ rệt)
- [ ] 10.3 **Không cần lặp lại test concurrency thủ công** — dùng thẳng kết quả `allocation.concurrency.spec.ts` đã pass làm bằng chứng khi trình bày, đây đã là bằng chứng mạnh hơn bất kỳ thao tác tay nào có thể tái tạo

---

## Tổng kết mức độ sẵn sàng

Sau khi tick hết (trừ các mục optional), hệ thống đã được verify đầy đủ qua tầng HTTP thật, đúng route thật, đúng role thật — không còn phụ thuộc vào "code trông có vẻ đúng" mà là "đã chạy qua và thấy đúng". Nếu có mục nào fail, ưu tiên sửa theo thứ tự: **Section 7 (bảo mật) → Section 0/3/4/5 (luồng chính) → Section 1/2/6/8 (validate) → Section 9/10 (bổ trợ)**.
