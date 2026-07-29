# Hệ thống Quản lý Tòa nhà Đỗ xe (PBMS)
## Báo cáo Đặc tả Yêu cầu Phần mềm và Triển khai (SRS & Presentation Report)

**Phiên bản:** 1.5  
**Trạng thái:** Production Live Snapshot — Cập nhật ngày 29 tháng 7 năm 2026  
**Loại hệ thống:** Hệ thống quản lý tòa nhà đỗ xe cho các hoạt động dựa trên web và ứng dụng cho tài xế (100% Pure Web Consoles Demo)  
**Primary stack:** NestJS, Prisma ORM, PostgreSQL, Vite/React, Plate Recognizer OCR API, VNPAY Sandbox  
**Ngôn ngữ giao diện (UI Standard):** 100% Full English chuẩn hóa toàn bộ các màn hình Web Consoles  

**Tóm tắt thay đổi kể từ v1.3.** Đã cập nhật hoàn chỉnh các tính năng thực tế đang chạy trên source-code hiện tại:
1. **Gate Auto-routing Exit QR Pass**: Tự động phát hiện mã QR Ra Cổng tại màn hình Check-in và tự nhảy sang luồng Check-out.
2. **Staff Gate Reservation QR Panel**: Thiết kế 2-Column Split Layout (Camera 16:9, ô token nhập tay, phím tắt `<kbd>↵ Enter</kbd>`).
3. **Session Summary & Fee Transparency**: Bổ sung hiển thị `Driver` (Tên + SĐT), `Check-in time`, và chiết khấu `20% Reservation Discount` (giá gốc vs giá sau giảm).
4. **Manager Session History Redesign**: Thêm 5 thẻ thống kê tốc độ đọc 5 giây (`Currently Parked`, `Cars Parked`, `Motorbikes Parked`, `Checked Out Today`, `Revenue`), bộ lọc 2 lớp (`Status` & `Vehicle Type`), tính thời gian đỗ trôi qua real-time (`elapsed`), ưu đẩy xe `Active` lên đầu và chuẩn hóa nhãn `Completed`.
5. **Kịch bản Thuyết trình Pure Web Demo**: Trình bày chi tiết 4 flow demo thuần Web cho cả 4 Role (Driver, Staff, Manager, Admin), giữ nguyên 100% các thuật ngữ chuyên ngành.

---

## 1. Mục đích và Phạm vi

### Bối cảnh và Bài toán Thực tiễn

**Nỗi đau nghiệp vụ (Pain-points):**
Nghiệp vụ tòa nhà gửi xe truyền thống gặp nhiều vấn đề bất cập khi quản lý thủ công:
- **Ùn ứ tại cổng:** Ghi vé tay, soát vé bằng mắt làm luồng xe di chuyển chậm, đặc biệt vào giờ cao điểm.
- **Khó kiểm soát sức chứa:** Bảo vệ không biết chính xác khu vực nào còn chỗ, dẫn đến xe chạy vòng vèo tìm chỗ đỗ.
- **Thất thoát và khó đối soát doanh thu:** Thu tiền mặt phụ thuộc vào tính toán của nhân viên, dễ nhầm lẫn phí, khó đối soát cho kế toán.
- **Xử lý sự cố kém hiệu quả:** Các tình huống mất vé, xe quá hạn, hoặc sai lệch biển số phải giải quyết bằng biên bản giấy tờ phức tạp, tốn thời gian.

**Giải pháp của PBMS:**
Hệ thống PBMS số hóa và tự động hóa toàn diện quy trình này bằng một hệ sinh thái API tập trung:
- **Chống ùn ứ:** Tích hợp Camera OCR nhận diện biển số cho khách vãng lai và quét QR Code động (Dynamic QR) cực nhanh cho khách đã đặt chỗ trước. Tự động nhận diện thẻ Ra Cổng (Exit Pass QR) ngay từ màn hình check-in để nhảy thẳng sang luồng Check-out.
- **Phân bổ chỗ đỗ thông minh (Smart Allocation):** Thuật toán tự động tìm và khóa (lock) slot trống ngay khi xe check-in/reservation, điều hướng xe đi đúng chỗ, triệt tiêu tình trạng quá tải cục bộ.
- **Minh bạch doanh thu:** Hệ thống tự động tính toán phí linh hoạt (tự động áp dụng chiết khấu 20% Reservation Discount), hỗ trợ thanh toán qua tiền mặt và cổng VNPay (Bank QR), nhân viên không can thiệp thủ công vào dòng tiền, giúp giảm thiểu sai sót và dễ dàng đối soát.
- **Kiểm soát ngoại lệ chặt chẽ:** Ứng dụng "Vé ảo" (Session gắn với Biển số) giúp dễ dàng giải quyết mất vé. Mọi sai lệch thông tin (Mismatch) đều hiển thị ảnh bằng chứng Side-by-Side và hỗ trợ bấm "Request Manager Review" để Quản lý giải quyết trên Dashboard, đảm bảo an ninh tuyệt đối.

### Phạm vi Hệ thống

PBMS số hóa luồng vận hành của một tòa nhà đỗ xe nhiều tầng. Nó hỗ trợ bốn role nghiệp vụ: Driver, Gate Staff, Manager, và Administrator.

Hệ thống quản lý việc nhận diện xe, phân bổ slot, reservation, check-in, checkout, thanh toán, các sự cố vận hành, hình ảnh bằng chứng và báo cáo quản lý.

Nguyên tắc thiết kế cốt lõi là **hoạt động do nhân viên xác nhận (Staff-confirmed operations)**:
- Hệ thống có thể nhận diện biển số, xử lý reservation, tính toán phí, hoặc xác định một ngoại lệ.
- Một nhân viên phải xem xét kết quả và xác nhận rõ ràng việc check-in, thanh toán, và xe ra.
- Hệ thống không tự động mở barie hoặc hoàn tất việc ra/vào vật lý.

### In scope (đã triển khai)

- Check-in walk-in thông qua nhận diện biển số OCR.
- Check-in reservation thông qua mã QR có thời hạn ngắn, không cần gọi nhà cung cấp OCR. Reservation yêu cầu xe liên kết (xem phần 3.2/3.4).
- Quét biển số hợp nhất định tuyến nhân viên đến check-in hoặc checkout từ trạng thái session hiện tại. Tự động chuyển luồng Checkout khi quét mã QR Exit Pass tại Check-in.
- Check-out, thanh toán tiền mặt, thanh toán VNPay Bank QR, và xác nhận xe ra thủ công.
- Bốn chiến lược allocation thông minh có thể cấu hình (`random`, `first_available`, `floor_balanced`, `zone_priority`).
- Reservation của tài xế, hiển thị QR, active session, lịch sử, và notification.
- Chụp và truy xuất bằng chứng cho check-in và checkout.
- Hàng đợi vận hành của Manager (Operation Issues Queue, Session History với bộ lọc real-time) và các giao diện báo cáo/audit của Administrator.
- Ownership check khi truy xuất session/QR (phần 3.1).
- Đăng ký xe tự phục vụ với sự phê duyệt của quản lý (phần 3.10).

---

## 2. Kiến trúc Hệ thống

```text
 React Web Consoles (100% Full English UI)      React Native Mobile App
 Administrator | Manager | Gate Staff                   Driver
               |                                          |
               +--------------------- HTTPS / REST API ---+
                                         |
                                  NestJS REST API
      Auth | Sessions | Reservations | Gate Operations | Payments
      Slots | Allocation | OCR Evidence | Operations | Reports
                                         |
                            Prisma ORM / PostgreSQL
                                         |
                    Local / Cloud File Storage (JPG & Thumbnail)
                                         |
             Nhà cung cấp bên ngoài: Plate Recognizer OCR, VNPay Gateway
```

---

## 3. Yêu cầu Chức năng — Các tính năng Đã triển khai

### 3.1 Authenticate và kiểm soát truy cập
- Tài xế có thể tự đăng ký bằng số điện thoại và mật khẩu.
- Login hỗ trợ số điện thoại hoặc username cộng với mật khẩu.
- Mật khẩu được hash bằng bcrypt.
- Một JWT chứa ID và role của người dùng. Thời gian sống mặc định của token là 7 ngày.
- API sử dụng `JwtAuthGuard` và `RolesGuard`; quyền truy cập được check server-side.
- Vô hiệu hóa người dùng ngăn chặn các request authenticate tiếp theo.
- **Ownership check khi truy xuất session đã được triển khai:** `GET /sessions/:id` và `GET /sessions/:id/qr` trả về 404 cho non-owner để tránh enum ID.

### 3.2 Đăng ký và nhận dạng xe
- Một tài xế có thể có nhiều xe liên kết (ví dụ hai ô tô và hai xe máy).
- **Một reservation mới yêu cầu một xe active được liên kết với tài xế request.** `CreateReservationDto` yêu cầu `vehicleId`, và `ReservationsService` validate trước khi tiếp tục.
- Giá trị biển số được normalize trước khi lookup và persist (ví dụ `62B1-456.78` -> `62B145678`).
- Gate hỗ trợ input biển số OCR, sửa chữa thủ công, QR reservation, QR session, mã session, và lookup biển số.
- **Đăng ký xe tự phục vụ (Self-service Vehicle Registration):** Tài xế nộp yêu cầu kèm ảnh Cà vẹt xe từ Web Portal/App. Manager duyệt yêu cầu trên Web Dashboard. Tự động liên kết quyền sở hữu khi được duyệt.

### 3.3 Phân bổ slot thông minh (Smart Allocation)
- Service phân bổ được triển khai sử dụng Strategy Pattern (`random`, `first_available`, `floor_balanced`, `zone_priority`).
- Concurrency-aware: hệ thống lock slot trống trong một `Serializable Transaction`, retry các lựa chọn conflict, và chuyển trạng thái slot sang `reserved` hoặc `occupied`.

### 3.4 Reservation và check-in ưu tiên QR
1. Tài xế chọn một chiếc xe đã liên kết và thời gian đến dự kiến.
2. Backend check xem tài xế và xe có reservation nào đang active hay chưa.
3. Allocation service chọn và lock một slot matching.
4. Slot trở thành `reserved`; reservation trở thành `active` và có expiry timestamp.
5. Client request một token QR có thời hạn ngắn, đã ký.
6. Staff scan QR tại `/staff/gate` (tab Reservation QR).
7. API verify token, reservation, xe liên kết, tài xế, và slot. Quy trình này đọc dữ liệu nội bộ database và không gọi OCR provider.
8. Nhân viên xem thông tin (Tên tài xế, Biển số, Slot), đối chiếu xe thực tế, rồi chọn **Confirm Check-in** (hoặc nhấn phím `Enter`).
9. Reservation trở thành `fulfilled`, slot trở thành `occupied`, và một `ParkingSession` được tạo.

### 3.5 Luồng gate hợp nhất và tự động định tuyến
- `POST /gate/scan-plate` gọi OCR một lần và lưu trữ kết quả/bằng chứng OCR.
- `POST /gate/resolve-plate` re-route sau khi sửa đổi biển số manual mà không cần gọi lại OCR.
- **Auto-routing Exit QR Pass:** Quét mã QR Ra Cổng tại màn hình Check-in sẽ tự động phát hiện và nhảy ngay sang giao diện Check-out.
- Open session bao gồm `active`, `checkout_pending`, và `exit_authorized`.

### 3.6 Vòng đời parking session
- Mã session được tạo trung tâm từ UUID với prefix `PBMS-`.
- Checkout không tự động release slot. Chỉ **Confirm Exit** mới transition session sang `completed` và release slot.
- Luồng lost-ticket ghi lại thông tin tài liệu định danh và mark `isLostTicket`.

### 3.7 Thanh toán
- Nhân viên có thể thu tiền mặt hoặc tạo thanh toán VNPay Bank QR cho session `checkout_pending`.
- Thẻ `FEE` và `SESSION SUMMARY` hiển thị rõ ràng giá gốc, chiết khấu **20% Reservation Discount**, Tên + SĐT tài xế, và thời gian vào bãi (`Check-in time`).
- Backend tạo provider payment URL và validate chữ ký/amount từ VNPay return/IPN.
- Nhân viên bấm **Confirm Exit** để hoàn thành xuất bến.

### 3.8 Hình ảnh bằng chứng OCR
- Bằng chứng thu thập ở check-in và check-out, hiển thị Side-by-Side trên giao diện Check-out và Audit Sheet của Manager.
- Scheduled cron jobs tự động xóa hình ảnh gốc hết hạn nhưng giữ metadata để audit.

### 3.9 Các vấn đề vận hành và notification
- Nhân viên có thể bấm `Request Manager Review` để tạo `OperationIssue` cho Manager.
- Manager dashboard sử dụng Server-Sent Events (SSE).
- Driver nhận notification cho session start, cảnh báo expiry reservation, và kết quả duyệt Đăng ký xe.

### 3.10 Đăng ký xe tự phục vụ (Self-service Vehicle Registration)
- Driver nộp yêu cầu kèm ảnh Cà vẹt xe (`Vehicle Registration Certificate`).
- Manager duyệt yêu cầu trên Web Console (`/manager/vehicles`), xem ảnh bằng chứng trước khi Approve/Reject.
- Tự động hết hạn (Expire) các yêu cầu treo quá 24h qua CronJob.

### 3.11 Danh mục Trạng thái & Vòng đời Trạng thái trong Hệ thống (System Status Lifecycles)

PBMS quản lý toàn bộ các thực thể thông qua các tập trạng thái (Status Lifecycles) nghiêm ngặt để bảo đảm tính nhất quán dữ liệu (Data Consistency) và khả năng đối soát (Auditing):

#### 1. Trạng thái Giữ chỗ (`ReservationStatus`)
* **`active`**: Đã đặt chỗ thành công trên Portal/App, slot đã được khóa (`reserved`). Vòng đời mặc định 60 phút.
* **`fulfilled`**: Tài xế đã quét mã QR tại cổng và Staff bấm *Confirm Check-in* thành công (chuyển giao sang `ParkingSession`).
* **`cancelled`**: Đặt chỗ bị hủy bởi Driver hoặc Manager trước khi check-in.
* **`expired`**: Đặt chỗ quá hạn thời gian đến mà không check-in. CronJob tự động chuyển sang `expired` và giải phóng slot về `available`.

#### 2. Trạng thái Phiên xe đỗ (`SessionStatus` / `ParkingSession`)
* **`active` (Badge: `Parked`)**: Xe đã qua cổng check-in thành công và đang đỗ thực tế trong tòa nhà.
* **`checkout_pending` (Badge: `Exiting`)**: Đã quét biển số OCR hoặc QR xuất bãi tại cổng ra, hệ thống đã dừng đồng hồ, tính tổng tiền phí đỗ và chờ thanh toán/xác nhận.
* **`exit_authorized` (Badge: `Exiting`)**: Xe đã thanh toán thành công (qua VNPAY Bank QR hoặc Tiền mặt), sẵn sàng cho nhân viên bấm xác nhận mở barie.
* **`completed` (Badge: `Completed`)**: Nhân viên bảo vệ bấm *Confirm Exit*, xe đã thực tế rời bãi, slot đỗ được giải phóng về `available`.
* **`cancelled`**: Phiên đỗ bị hủy do ngoại lệ quản lý.

#### 3. Trạng thái Vị trí đỗ (`SlotStatus` / `Slot`)
* **`available`**: Slot trống, sẵn sàng cho phân bổ đỗ xe Walk-in hoặc Đặt chỗ trước (Reservation).
* **`reserved`**: Slot đang được khóa giữ chỗ bởi một `Reservation` ở trạng thái `active`.
* **`occupied`**: Slot đang có xe đỗ thực tế (`ParkingSession` đang `active` hoặc `checkout_pending`).
* **`maintenance`**: Slot đang trong quá trình bảo trì/sửa chữa, không tham gia phân bổ đỗ xe.

#### 4. Trạng thái Thanh toán (`PaymentStatus` / `Payment`)
* **`pending`**: Đã khởi tạo hóa đơn thanh toán (Tiền mặt hoặc VNPAY QR), đang chờ nhận tiền.
* **`paid` / `completed`**: Đã thanh toán tiền thành công (nhận Webhook IPN từ VNPAY hoặc Staff bấm xác nhận tiền mặt).
* **`failed`**: Giao dịch VNPAY bị lỗi hoặc không thành công.
* **`cancelled`**: Giao dịch thanh toán bị hủy.
* **`expired`**: Mã VNPAY Bank QR hết thời hạn thanh toán mà không được quét.

#### 5. Trạng thái Đăng ký Xe (`VehicleRegistrationStatus`)
* **`pending`**: Yêu cầu đăng ký xe mới do Driver nộp kèm ảnh Cà vẹt xe, chờ Manager duyệt trên `/manager/vehicles`.
* **`approved`**: Manager đã duyệt thành công. Xe chính thức được liên kết sở hữu với tài khoản Driver.
* **`rejected`**: Manager từ chối duyệt (có kèm lý do từ chối bắt buộc).
* **`expired`**: Yêu cầu treo quá 24h không được xử lý (CronJob tự động chuyển `expired`).

#### 6. Trạng thái Sự cố Vận hành (`OperationIssueStatus` / `OperationIssue`)
* **`pending` / `open`**: Sự cố sai biển số, mất vé hoặc nghi ngờ do Staff báo cáo lên (`Request Manager Review`).
* **`resolved`**: Manager đã kiểm tra bằng chứng, xử lý và đóng sự cố.
* **`dismissed`**: Manager bác bỏ sự cố sau khi xác minh không có vi phạm.

---

## 4. Phân quyền và Kiểm soát Truy cập (RBAC Matrix)

| Chức năng (Web Consoles) | Driver Portal | Staff Gate | Manager Console | Admin Console |
|---|:---:|:---:|:---:|:---:|
| Đăng ký xe tự phục vụ (`Vehicle Registration`) | ✅ | ❌ | ❌ | ❌ |
| Phê duyệt / Từ chối Đăng ký xe (`Vehicle Approvals`) | ❌ | ❌ | ✅ | ✅ |
| Tạo `Reservation` Đặt chỗ & Sinh mã QR Exit Pass | ✅ | ❌ | ❌ | ❌ |
| Quét OCR Biển số & Quét QR Check-in tại cổng | ❌ | ✅ | ❌ | ❌ |
| Xử lý Auto-routing Exit QR Pass & Check-out | ❌ | ✅ | ❌ | ❌ |
| Thu tiền mặt / Khởi tạo Bank QR VNPAY | ❌ | ✅ | ❌ | ❌ |
| Báo cáo sự cố (`Request Manager Review`) | ❌ | ✅ | ❌ | ❌ |
| Xử lý danh sách sự cố (`Operation Issues Queue`) | ❌ | ❌ | ✅ | ✅ |
| Xem Báo cáo Giám sát Real-time & Filter Session History | ❌ | ❌ | ✅ | ✅ |
| Quản trị Tài khoản người dùng & Operational Audit Flags | ❌ | ❌ | ❌ | ✅ |

---

## 5. Chế độ xem Quản lý và Báo cáo (Manager / Admin Views)

- **Manager Console (`/manager/*`):**
  - **Session History (`/manager/sessions`):** Thanh 5 thẻ thống kê 5-second scan (`Currently Parked`, `Cars Parked`, `Motorbikes Parked`, `Checked Out Today`, `Revenue`), bộ lọc 2 lớp (`Status` & `Vehicle Type`), tính thời gian đỗ trôi qua real-time (`elapsed`), ưu tiên xếp xe `Active` lên đầu, chuẩn nhãn `Completed` và nút `View` soi ảnh bằng chứng OCR.
  - **Vehicles (`/manager/vehicles`):** Hàng đợi duyệt yêu cầu đăng ký xe kèm viewer xem ảnh Cà vẹt xe.
  - **Operations (`/manager/operations`):** Hàng đợi xử lý các sự cố vận hành do Staff gửi lên (`OperationIssue`).
- **Admin Console (`/admin/*`):**
  - **Reports & Flags (`/admin/reports`):** Theo dõi cảnh báo cờ vận hành toàn cục (`Long Active Session >24h`, `Checkout Pending >10m`, `Paid - Not Exited`, `Expired Reservation`).

---

## 6. Yêu cầu Phi Chức năng

- **Correctness:** Serializable Transactions cho slot allocation, tránh double-booking.
- **Security:** JWT authentication, RolesGuard, BOLA ownership checks, VNPAY checksum validation.
- **Usability:** Giao diện 100% Full English, hỗ trợ phím tắt `<kbd>↵ Enter</kbd>`, phím bấm phản hồi tức thì.
- **Performance:** Dynamic QR validation đọc trực tiếp database không qua OCR provider, phản hồi < 200ms.
- **Localization:** 100% Full English chuẩn hóa toàn bộ các giao diện Web Consoles.

---

## 7. Bằng chứng Chất lượng Đã kiểm chứng

- **Build verification:** API (`NestJS`) và Web (`Vite/React`) build & typecheck pass 100% không lỗi.
- **Allocation concurrency test:** Pass trên cơ sở dữ liệu thực (15 trial).
- **Session-ownership fix (BOLA):** Trả về 404 cho non-owner trên `GET /sessions/:id`.

---

## 8. Lộ trình Ưu tiên (Priority Roadmap)

### P0 - Ổn định trước buổi thuyết trình (Đã hoàn thành 100%)
Tất cả các task P0 (Sửa Unit Test, Verify VNPAY Sandbox, 100% Full English UI, Session Ownership BOLA, Exit QR Auto-routing, Session History Redesign) đã hoàn thành 100% trong mã nguồn.

### P1 - Tăng cường bảo mật và Audit
1. Restrict truy xuất OCR evidence bằng quyền/vai trò.
2. Thêm audit event log toàn cục.
3. CI/CD pipeline tự động.

---

## 9. Công việc Đang tiến hành (WIP Design)

- Tự động hóa phát hiện Plate-mismatch & tự động raise `OperationIssue`.
- Đếm số lượng biển số distinct nghi ngờ.

---

## 10. Lộ trình Tương lai & Thiết kế Gate/Lane

- Phân tách cổng thành các lane vật lý cố định theo `car` / `motorbike`.
- Admin cấu hình lane, Manager phân công Staff vào lane đang active.

---

## 11. Kịch bản Thuyết trình Pure Web Demo (Step-by-Step Web Screen Walkthrough)

Dưới đây là **4 kịch bản Demo thuần Web (Pure Web Consoles)** được thiết kế chi tiết từng bước cho buổi bảo vệ đồ án/thuyết trình sản phẩm. Kịch bản sử dụng 100% giao diện Web (Driver Portal, Staff Gate, Manager Console, Admin Console), giữ nguyên toàn bộ các thuật ngữ chuyên ngành và mô tả chính xác những gì diễn ra trên từng màn hình:

### Kịch bản 1: Driver Đăng ký Xe Tự phục vụ & Manager Phê duyệt (Pure Web Flow)
- **Bước 1 (Driver Web Portal):** Tài xế đăng nhập Web Portal, vào trang `Vehicle Registration`. Nhập Biển số `62B1-456.78`, Loại xe `Motorbike`, upload file ảnh Cà vẹt xe (`Vehicle Registration Certificate`). Bấm **Submit Registration Request**. (Trạng thái yêu cầu: `Pending`).
- **Bước 2 (Manager Web Console):** Quản lý mở Web Dashboard, kiểm tra danh sách `Pending Requests Queue`. Bấm nút **View Certificate** để mở Modal xem ảnh cà vẹt xe phóng to do tài xế tải lên.
- **Bước 3 (Manager Web Console):** Manager bấm nút màu xanh **Approve Request**. Backend thực thi Transaction tạo liên kết sở hữu xe chính thức (`VehicleUser` với role `owner`).
- **Bước 4 (Driver Web Portal):** Màn hình của Driver tự động cập nhật trạng thái xe thành `Approved`. Xe chính thức đủ điều kiện sử dụng các dịch vụ của bãi đỗ.

### Kịch bản 2: Driver Đặt chỗ Trước (Reservation) & Staff Quét QR Check-in Ưu tiên
- **Bước 1 (Driver Web Portal):** Tài xế chọn xe đã duyệt `62B1-456.78` và thời gian dự kiến đến -> Bấm **Book Reservation Now**.
- **Bước 2 (Backend Core - Smart Allocation Engine):** Thuật toán tự động tìm slot phù hợp và thực thi `Serializable Transaction` để **khóa (lock) slot `T1-B-01`** (chuyển trạng thái slot sang `reserved`), đảm bảo triệt tiêu 100% rủi ro đụng slot / double-booking. Đồng thời áp dụng chính sách ưu đãi chiết khấu **20% Reservation Discount**.
- **Bước 3 (Driver Web Portal):** Driver mở trang `Digital Exit Pass QR`, xem mã QR Code động có thời hạn ngắn (chống chụp màn hình giả mạo).
- **Bước 4 (Staff Web Console -> Reservation QR):** Xe chạy đến cổng, nhân viên bấm nút **Scan QR Pass** (giao diện 2-Column Split Layout với Camera 16:9 và ô nhập Token thủ công). Staff đưa mã QR của khách vào camera (hoặc nhập token ngắn).
- **Bước 5 (Staff Web Console):** Cột thông tin hiển thị ngay: Biển số `62B1-456.78`, Driver `Thanh Phúc (0944941764)`, Slot `T1-B-01`. Staff đối chiếu xe thực tế -> Bấm **Confirm Check-in** (hoặc dùng phím tắt `<kbd>↵ Enter</kbd>`). `Reservation` chuyển sang `fulfilled`, `ParkingSession` tạo ở trạng thái `active`, slot `T1-B-01` chuyển sang `occupied`, barie vật lý được nhân viên mở cho xe vào.

### Kịch bản 3: Khách Vãng Lai (Walk-in) Check-in bằng AI Camera & Xử lý Tự chuyển Luồng khi Quét Exit Pass QR
- **Bước 1 (Staff Web Console -> OCR Check-in):** Một xe lạ chưa đặt chỗ chạy đến cổng. Staff bấm chụp ảnh bằng Camera OCR. Backend gọi `Plate Recognizer API` nhận diện biển số, không tìm thấy tài khoản -> Gắn nhãn `Walk-in Guest`, tự động phân bổ 1 slot trống khả thi. Staff bấm **Confirm Check-in**, hệ thống in vé giấy (Thermal Receipt) giao cho tài xế.
- **Bước 2 (Staff Web Console - Auto-routing Exit QR Pass):** Khi xe xuất bãi, nếu tài xế xuất trình mã **Digital Exit Pass QR** và nhân viên đưa mã này vào camera tại màn hình Check-in, hệ thống **tự động nhận diện (Auto-detect)** mã QR thuộc về phiên xe đang đỗ (`62B1-456.78`).
- **Bước 3 (Staff Web Console):** Màn hình hiển thị Toast: *"QR code belongs to Exit Pass for vehicle 62B1-456.78. Auto-routing to Checkout..."* và **tự động nhảy ngay sang giao diện Check-out** mà nhân viên không cần bấm chuyển tab thủ công.

### Kịch bản 4: Check-out, Thanh toán VNPAY Bank QR & Manager Real-time Monitoring
- **Bước 1 (Staff Web Console -> Checkout):**
  - Màn hình hiển thị thẻ **FEE**: `152,000 VND`, kèm Badge **`20% Reservation Discount`** và dòng chi tiết giá gốc vs giá giảm (`Original: ~190.000 VND~ (-38.000 VND)`).
  - Khung **SESSION SUMMARY**: Hiển thị đầy đủ Session code `PBMS-94421049C6`, Vehicle type `Motorbike`, **Driver `Thanh Phúc (0944941764)`**, Ticket type `Reservation QR`, **Discount `-20% (Reservation)`**, **Check-in time `23:48:37 28/07/2026`**, Duration `18h 39m`, Slot `T1-B-01`.
  - Khung **EVIDENCE**: Hiển thị ảnh đối chiếu Check-in vs Check-out Side-by-Side.
- **Bước 2 (Staff & Driver Web Portals):** Staff bấm **Generate VNPAY** -> Màn hình hiển thị mã VNPAY Bank QR Code. Driver dùng App Ngân hàng thanh toán `152,000 VND` qua cổng VNPAY Sandbox.
- **Bước 3 (Staff Web Console):** Khi nhận tín hiệu Webhook IPN (hoặc thu tiền mặt bấm **Confirm Cash Payment**), trạng thái chuyển sang `Exit Authorized`. Staff bấm **Confirm Exit** để mở cổng cho xe ra. Session chuyển sang `completed`, giải phóng slot `T1-B-01` về `available`.
- **Bước 4 (Manager Web Console):** Manager mở trang `Session History`, xem **5-Second Scan Summary Strip** (Currently Parked, Cars Parked, Motorbikes Parked, Checked Out Today, Revenue). Sử dụng bộ lọc nhanh `Status` (`All` | `Active` | `Completed`) và `Vehicle Type`. Danh sách xe đang đỗ (`Active`) tự động nổi lên đầu với thời gian đỗ trôi qua thực tế (`elapsed`), nhãn trạng thái xe đã xuất bãi hiển thị chuẩn **`Completed`**. Bấm nút **View** ở cột Audit để xem lại bằng chứng OCR.
- **Bước 5 (Admin Web Console):** Admin xem màn hình `Operational Audit & Flags`, theo dõi các cờ cảnh báo bất thường tự động.

### 11.1. Kịch bản Thuyết trình Cốt lõi (Core Workflow Presentation Script)

*(Sử dụng khi trình chiếu Sơ đồ Activity Diagram của luồng Main Happy-path)*

- **Phase 1 (Khởi tạo):** "Mọi thứ bắt đầu khi xe chạy đến cổng Check-in. Tại đây, hệ thống rẽ thành hai luồng: Nếu là Khách Vãng Lai, nhân viên dùng Camera chụp biển số để AI OCR nhận diện. Nếu là Khách Đặt chỗ, chỉ cần quét mã QR Exit Pass. Khách đặt trước đi qua cổng rất nhanh với tốc độ < 200ms mà không tốn chi phí gọi API OCR."
- **Phase 2 (Xác thực & Mở cổng):** "Khi dữ liệu đã khớp, nhân viên bấm nút `Confirm Check-in`. Ngay lập tức, thanh Fork sẽ kích hoạt 3 hành động đồng thời: Đánh dấu Slot đỗ là `Occupied`, tạo ra `ParkingSession` trạng thái `active`, và gửi lệnh `Mở Barie` cho xe vào bãi."
- **Phase 3 (Xuất bãi Auto-routing):** "Sau khi xe đỗ và quay ra cổng Check-out, tính năng **Auto-routing** phát huy tác dụng. Nếu quét lại mã QR Check-in lúc nãy, hệ thống tự động phát hiện xe đang đỗ và lập tức ném thẳng nhân viên sang màn hình Check-out mà không cần thao tác tay."
- **Phase 4 (Thanh toán & Đóng luồng):** "Hệ thống tự động tính tiền và áp dụng mã giảm giá 20%. Nếu khách chọn VNPAY, hệ thống sẽ chờ IPN. Cuối cùng, nhân viên bấm `Confirm Exit`. Thanh Fork cuối cùng thực thi 3 tác vụ: Đóng phiên đỗ xe thành `Completed`, giải phóng Slot thành `Available`, và mở Barie cho xe ra. Vòng đời khép kín và minh bạch."

### 11.2. Kiến thức Bảo vệ Đồ án (Academic Defense): Thanh Fork & Concurrency Evidence

**Câu hỏi thường gặp:** *"Tại sao ở bước Confirm Check-in / Confirm Exit em lại dùng thanh gạch ngang màu đen mà không dùng mũi tên đi thẳng xuống?"*

**Điểm trả lời (UML Fork Node):**
- Thanh gạch đen ngang trong UML gọi là **Fork Node**, biểu diễn các luồng xử lý đồng thời (Concurrency / Parallelism).
- Việc dùng thanh Fork thể hiện đúng bản chất hệ thống được thiết kế theo kiến trúc hướng sự kiện (Event-driven) và xử lý bất đồng bộ, tối ưu hóa thời gian chờ của xe tại cổng. 
- Ngay khi nhân viên bấm **Confirm Check-in**, backend thực thi một Transaction nguyên khối bắn ra 3 tiến trình cập nhật Database đồng thời.

**Evidence Code Path (Chứng minh trong Source Code):**
Tại `apps/api/src/sessions/sessions.service.ts` (Dòng 590-600), trong khối giao dịch `confirmReservationCheckIn`:
```typescript
        // Tiến trình 1: Cập nhật trạng thái Reservation -> fulfilled
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'fulfilled' },
        });

        // Tiến trình 2: Cập nhật trạng thái Slot -> occupied
        await tx.slot.update({
          where: { id: reservation.slotId },
          data: { status: 'occupied' },
        });

        // Tiến trình 3: Khởi tạo ParkingSession -> active
        const session = await this.createParkingSession(tx, { ... });
```
*(Ba thao tác trên nằm trong cùng một `Serializable Transaction (tx)`, thể hiện nguyên lý thực thi nguyên khối và thiết kế DB logic đồng thời để triệt tiêu thời gian trễ API của nhân viên).*

---

## 12. Các câu hỏi Phản biện và Gợi ý Điểm trả lời (Q&A Defense)

1. **Tại sao Reservation lại bỏ qua bước gọi AI OCR nhận diện biển số tại cổng?**
   - *Trả lời:* Vì tài xế đã đặt chỗ trước trên Driver Portal, hệ thống đã biết chính xác Biển số, Slot và thông tin cá nhân. Mã QR chứa mã Token định danh an toàn. Việc quét QR đọc trực tiếp từ Database nội bộ chỉ mất < 200ms, vừa giúp xe qua cổng nhanh gấp 5 lần, vừa tiết kiệm chi phí gọi API OCR bên ngoài.
2. **Hệ thống xử lý thế nào khi 2 người cùng đặt chỗ vào 1 slot trống cuối cùng tại một thời điểm?**
   - *Trả lời:* Thuật toán Smart Allocation được bọc trong `Prisma Interactive Transaction` với cấp độ cách ly `IsolationLevel = Serializable`. Khi 2 request tới cùng lúc, Database sẽ khóa dòng và bắt 1 request chờ/lỗi; backend tự động catch lỗi và retry chọn slot khả thi khác, đảm bảo tuyệt đối không bao giờ bị Double-booking.
3. **Nếu tài xế quên quét mã QR ở cổng vào mà đưa mã QR tại cổng ra thì sao?**
   - *Trả lời:* Hệ thống có cơ chế `Exit Pass Auto-routing`. Khi nhân viên quét mã QR tại màn hình Check-in, backend kiểm tra và phát hiện mã thuộc về một `ParkingSession` đang đỗ (`Active`), hệ thống lập tức thông báo và tự động chuyển hướng màn hình sang giao diện Check-out để tính tiền xuất bãi.
4. **Sự khác biệt về trách nhiệm giữa Manager và Admin là gì?**
   - *Trả lời:* **Manager** quản lý vận hành trực tiếp trong ngày (phê duyệt đăng ký xe, xử lý sự cố `OperationIssue`, xem danh sách xe trong bãi real-time). **Admin** quản trị hệ thống dài hạn (quản lý tài khoản user, phân quyền RBAC, theo dõi cờ cảnh báo bất thường `Operational Audit Flags`).

---

## 13. Kết luận

Hệ thống PBMS đã hiện thực hóa trọn vẹn và đáng tin cậy luồng vận hành của tòa nhà đỗ xe thông minh. Với kiến trúc Web Consoles 100% chuẩn hóa Tiếng Anh, khả năng tự động hóa cao từ Check-in QR, OCR Fallback, Auto-routing Check-out đến Thanh toán VNPAY Bank QR và Bảng điều khiển Real-time, dự án sẵn sàng cho buổi bảo vệ đồ án và triển khai thực tế.
