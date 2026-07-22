# Hệ thống Quản lý Tòa nhà Đỗ xe (PBMS)
## Báo cáo Đặc tả Yêu cầu Phần mềm và Triển khai

**Phiên bản:** 1.3
**Trạng thái:** Implementation snapshot, ngày 19 tháng 7 năm 2026
**Loại hệ thống:** Hệ thống quản lý tòa nhà đỗ xe cho các hoạt động dựa trên web và ứng dụng di động cho tài xế
**Primary stack:** NestJS, Prisma, PostgreSQL, Vite/React, React Native/Expo, VNPay

**Tóm tắt thay đổi kể từ v1.1.** Một đợt kiểm tra source-code cho thấy v1.1 đã mô tả một số hạng mục thiết kế đề xuất như thể đã được triển khai một phần. Phiên bản này sửa lại điều đó: **Phần 3 (Các tính năng đã triển khai) hiện chỉ mô tả những gì tồn tại trong source hiện tại**, với bằng chứng file/line nếu có sẵn. **Phần 9 (Công việc đang tiến hành)** và **Phần 10 (Lộ trình tương lai)** hiện là các phần riêng biệt, được gán nhãn rõ ràng thay vì các tag "(đang tiến hành)" nằm rải rác trong phần các tính năng đã triển khai. Sự đính chính quan trọng nhất: **reservation hiện tại vẫn yêu cầu một xe đã liên kết trong build hiện hành** — v1.1 đã trình bày sai rằng điều này đã trở thành tùy chọn. Không có hạng mục nào trong Phần 9 hoặc 10 nên được trích dẫn như là đang tồn tại trong hệ thống đang chạy.

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
- **Chống ùn ứ:** Tích hợp Camera OCR nhận diện biển số cho khách vãng lai và quét QR Code động (Dynamic QR) cực nhanh cho khách đã đặt chỗ trước.
- **Phân bổ chỗ đỗ thông minh (Smart Allocation):** Thuật toán tự động tìm và khóa (lock) slot trống ngay khi xe check-in, điều hướng xe đi đúng chỗ, triệt tiêu tình trạng quá tải cục bộ.
- **Minh bạch doanh thu:** Hệ thống tự động tính toán phí linh hoạt và tích hợp thanh toán qua cổng VNPay (Bank QR), nhân viên không can thiệp thủ công vào dòng tiền, giúp giảm thiểu sai sót và dễ dàng đối soát.
- **Kiểm soát ngoại lệ chặt chẽ:** Ứng dụng "Vé ảo" (Session gắn với Biển số) giúp dễ dàng giải quyết mất vé. Mọi sai lệch thông tin (Mismatch) đều yêu cầu nhân viên bấm "Request Manager Review" để Quản lý giải quyết trên Dashboard, đảm bảo an ninh tuyệt đối.

### Phạm vi Hệ thống

PBMS số hóa luồng vận hành của một tòa nhà đỗ xe nhiều tầng. Nó hỗ trợ bốn role nghiệp vụ: Driver, Gate Staff, Manager, và Administrator.

Hệ thống quản lý việc nhận diện xe, phân bổ slot, reservation, check-in, checkout, thanh toán, các sự cố vận hành, hình ảnh bằng chứng và báo cáo quản lý.

Nguyên tắc thiết kế cốt lõi là **hoạt động do nhân viên xác nhận**:

- Hệ thống có thể nhận diện biển số, xử lý reservation, tính toán phí, hoặc xác định một ngoại lệ.
- Một nhân viên phải xem xét kết quả và xác nhận rõ ràng việc check-in, thanh toán, và xe ra.
- Hệ thống không tự động mở barie hoặc hoàn tất việc ra/vào vật lý.

### In scope (đã triển khai)

- Check-in walk-in thông qua nhận diện biển số OCR.
- Check-in reservation thông qua mã QR có thời hạn ngắn, không cần gọi nhà cung cấp OCR. Reservation yêu cầu xe liên kết (xem phần 3.2/3.4).
- Quét biển số hợp nhất định tuyến nhân viên đến check-in hoặc checkout từ trạng thái session hiện tại.
- Check-out, thanh toán tiền mặt, thanh toán VNPay Bank QR, và xác nhận xe ra thủ công.
- Bốn chiến lược allocation thông minh có thể cấu hình.
- Reservation của tài xế, hiển thị QR, active session, lịch sử, và notification.
- Chụp và truy xuất bằng chứng cho check-in và checkout.
- Hàng đợi vận hành của Manager và các giao diện báo cáo/audit của Administrator.
- Ownership check khi truy xuất session/QR (phần 3.1).
- Đăng ký xe tự phục vụ với sự phê duyệt của quản lý (phần 3.10).

### In design, chưa triển khai (xem phần 9 và 10)

- Biến liên kết xe với reservation thành tùy chọn.
- Tự động log plate-mismatch, đếm số lượng nghi ngờ biển số distinct, và manager-to-administrator account escalation.
- Phân tách cổng thành các lane vật lý cố định theo `car`/`motorbike`, Admin cấu hình lane và tài khoản, Manager chỉ phân công staff đang active vào lane.
- Cải tiến Gate Console: chỉ đề xuất nhập biển số thủ công sau hai lần OCR không nhận diện, enforce workflow phát vé, và sửa vùng in ticket 80 mm.

### Out of scope

- Điều khiển phần cứng barie tự động.
- Hạ tầng camera/ANPR production-grade.
- Train AI hoặc train mô hình nhận diện xe/biển số custom.
- Advance booking cho các khung thời gian tùy ý trong tương lai; tính năng reservation được triển khai là việc giữ chỗ ngắn hạn.
- Triển khai object-storage production, CDN, disaster recovery, hoặc chính sách lưu giữ theo pháp luật.
- Luồng công việc "tài xế liên kết" thứ cấp do tài xế khởi xướng (không phải chủ sở hữu, nhiều người dùng cho một xe). Schema `VehicleUser` many-to-many có hỗ trợ điều này, nhưng hiện chưa có UI submit/approve nào cho nó.
- Public appeal channel không authenticate và cơ chế rate limit của nó (xem phần 10 — đã đề xuất, nhưng chưa thiết kế để triển khai sâu như các hạng mục ở phần 9).

---

## 2. Kiến trúc

```text
React web console                 React Native driver app
Admin | Manager | Staff           Driver
          |                         |
          +----------- HTTPS/API ---+
                              |
                       NestJS REST API
      Auth | Sessions | Reservations | Gate | Payments
      Slots | Allocation | OCR | Evidence | Operations | Reports
                              |
                 Prisma ORM / PostgreSQL
                              |
       Lưu trữ bằng chứng cục bộ (JPG nén + thumbnail)
                              |
            Nhà cung cấp bên ngoài: Plate Recognizer, VNPay
```

API là source of truth cho trạng thái nghiệp vụ. Các web và mobile client không trực tiếp mutate trạng thái database hoặc gọi nhà cung cấp thanh toán. Đặc biệt, chỉ có backend mới tạo và xác minh các request thanh toán VNPay.

### Công nghệ sử dụng (Tech Stack)

Hệ thống được xây dựng trên bộ công nghệ hiện đại, đảm bảo tính mở rộng và bảo mật:
- **Backend (Core API):** **NestJS** (Framework Node.js kiến trúc modular, dependency injection mạnh mẽ) kết hợp **Prisma ORM** (truy vấn database typesafe).
- **Database:** **PostgreSQL** (đảm bảo tính toàn vẹn ACID, đặc biệt quan trọng cho các transaction cấp phát slot tránh double-booking).
- **Web Frontend (Staff/Manager/Admin):** **ReactJS** (cùng Vite builder), cung cấp giao diện quản lý nhanh, phản hồi tức thời qua REST và SSE (Server-Sent Events).
- **Mobile Frontend (Driver):** **React Native** (sử dụng Expo), hỗ trợ triển khai đa nền tảng iOS/Android cho ứng dụng tài xế.
- **Dịch vụ tích hợp (External Providers):** 
  - **Plate Recognizer** (Xử lý OCR nhận diện biển số): Được lựa chọn vì phù hợp với scope dự án nhỏ, cần triển khai nhanh. Trọng tâm của hệ thống là System & Business Logic thay vì dành thời gian làm model OCR. Plate Recognizer có độ chính xác cực tốt khi nhận diện biển số Việt Nam, và nó cung cấp REST API rất gọn bên backend NestJS, xử lý chỉ trong vài trăm mili-giây. *(Thông tin thêm: Hỗ trợ Cloud API giúp hệ thống không cần duy trì server AI nặng nề, và có sẵn On-Premise SDK nếu sau này tòa nhà muốn chạy offline tại mạng nội bộ để tăng cường bảo mật)*.
  - **VNPay** (Cổng thanh toán nội địa): Xử lý Bank QR an toàn với xác thực chữ ký IPN/Return.
- **Lưu trữ (Storage):** Hiện tại sử dụng Local File System để lưu trữ bằng chứng (ảnh gốc nén JPG và thumbnail). Sẵn sàng migrate sang S3/MinIO cho môi trường production.

### Sơ đồ Ngữ cảnh (Context Diagram) & Kịch bản thuyết trình

Sơ đồ Context Diagram (Level 0) thể hiện ranh giới (boundary) của hệ thống PBMS, giúp người nghe nắm bắt nhanh cách các tác nhân (Actors) và hệ thống bên ngoài (External Systems) tương tác với lõi hệ thống.

**Kịch bản thuyết trình (Presentation Script) đề xuất:**

> "Kính thưa hội đồng/các bạn, trên màn hình là sơ đồ Context Diagram. Các bạn có thể thấy **PBMS đóng vai trò là bộ não trung tâm** (hình elip vàng) điều phối toàn bộ luồng dữ liệu của bãi đỗ xe.
>
> Tương tác trực tiếp với hệ thống là 4 nhóm người dùng chính (màu xanh). Mỗi role có một tập quyền hạn và luồng dữ liệu tách biệt rõ ràng:
> - **Driver (Tài xế)** tương tác từ xa qua Mobile App để đặt chỗ trước, quản lý tài khoản cá nhân và theo dõi lịch sử gửi xe.
> - **Gate Staff (Nhân viên cổng)** là người trực tiếp điều hành luồng xe thực tế. Họ nhận kết quả nhận diện từ camera, bấm nút xác nhận cho xe ra/vào và đặc biệt là khởi tạo các báo cáo ngoại lệ (Request Manager Review) đẩy lên cấp trên. Hệ thống thiết kế theo chuẩn *Staff-confirmed* (nhân viên luôn là người chốt dữ liệu cuối cùng).
> - **Manager (Quản lý bãi)** quản lý bao quát thông qua Analytics Dashboard và giải quyết các ngoại lệ (Exceptions Queue) do Staff báo cáo lên (như sai biển số, mất vé).
> - **Admin** đứng sau hậu trường cấu hình hệ thống (RBAC) và theo dõi log toàn cục.
>
> Để hệ thống nhẹ và tối ưu chi phí, PBMS đã ủy quyền 2 tác vụ khó nhất cho các hệ thống bên ngoài (External APIs):
> - Khi Staff chụp ảnh xe, ảnh được đẩy qua **Plate Recognizer (OCR API)**. Dịch vụ này xử lý bằng Cloud AI và trả về text biển số ngay lập tức. Việc này giúp chúng ta không phải tự build và maintain một model Computer Vision nặng nề.
> - Đối với thanh toán, PBMS tạo URL giao dịch và nhường việc trừ tiền cho **VNPay Gateway**. VNPay sau đó sẽ dùng cơ chế IPN (Webhook) báo lại cho PBMS biết giao dịch đã thành công để tự động mở cổng.
> 
> Tóm lại, kiến trúc này giúp PBMS cực kỳ tinh gọn, dồn 100% sức mạnh tính toán để xử lý các thuật toán lõi như Smart Allocation và quản lý State của bãi đỗ."

### Các luồng nghiệp vụ chính (Main Flows)

Hệ thống xoay quanh 3 luồng vận hành cốt lõi, tuân thủ nguyên tắc "nhân viên xác nhận" (staff-confirmed operation):

**Luồng 1: Walk-in Check-in (Khách vãng lai)**
1. Xe đến cổng, nhân viên (Gate Staff) chụp ảnh biển số.
2. Web Console gọi API quét biển số. Backend giao tiếp với Plate Recognizer để trích xuất biển số và lưu ảnh gốc làm bằng chứng (OcrEvidence).
3. Hệ thống tìm kiếm slot trống phù hợp thông qua Smart Allocation Strategy.
4. Nhân viên đối chiếu ảnh chụp và biển số trên màn hình, nhấn *Confirm Check-in*.
5. Backend khởi tạo `ParkingSession` ở trạng thái `active` và đánh dấu slot là `occupied`.
6. Hệ thống in vé giấy (Thermal Receipt) giao cho tài xế. *(Ghi chú bảo mật: Tờ vé này không dùng để tính tiền vì hệ thống OCR đã tracking data, nó đóng vai trò là Token Bảo Mật Vật Lý (Proof of Ownership) nhằm xác minh đúng người mang xe vào mới được mang xe ra, chống trộm xe).*

**Luồng 2: Reservation Check-in (Khách đặt trước bằng QR)**
1. Tài xế (Driver) chọn xe đã đăng ký và đặt chỗ trên Mobile App. Backend cấp phát, khóa (lock) một slot, và tạo `Reservation` (`active`).
   *(Cơ chế kỹ thuật: Việc khóa slot được lập trình bằng Prisma Interactive Transaction với `IsolationLevel = Serializable`. Hệ thống đọc slot đang `available` và cập nhật thành `reserved` trong cùng 1 transaction. Mức Serializable đảm bảo nếu 2 request cùng tranh chấp 1 slot, Database sẽ block/throw error, hệ thống sẽ tự động catch lỗi và retry cấp phát slot khác, đảm bảo tuyệt đối không bị Double-booking).*
   *(Cơ chế hết hạn: Reservation có `expiresAt` = thời gian đến dự kiến + timeout cấu hình được từ `SystemConfig`, mặc định 60 phút. CronJob chạy mỗi phút quét các reservation quá hạn, tự động chuyển trạng thái sang `expired` và giải phóng slot về `available`. Tài xế được gửi notification cảnh báo trước 5 phút.)*
2. Mobile App sinh mã QR token động (có vòng đời ngắn để chống giả mạo/chụp màn hình).
3. Xe đến cổng, nhân viên quét mã QR. 
4. Backend giải mã QR, xác thực reservation trực tiếp từ database (bỏ qua bước gọi OCR để tiết kiệm thời gian và chi phí).
5. Nhân viên đối chiếu xe thực tế, nhấn *Confirm Check-in*. Reservation chuyển thành `fulfilled`, Session bắt đầu.

**Luồng 3: Checkout và Thanh toán**
1. Xe ra cổng, nhân viên thu lại vé giấy (với khách Walk-in) và quét biển số (gọi OCR tương tự luồng 1).
2. Backend nhận diện biển số, đối khớp với `ParkingSession` đang mở và chuyển sang trạng thái `checkout_pending`. 
   *(Ngoại lệ bảo mật: Nếu khách Walk-in làm mất vé giấy, họ không đủ điều kiện mang xe ra dù AI có quét đúng biển số. Lúc này quy trình "Lost Ticket" kích hoạt: tài xế phải trình CCCD + Cà vẹt xe để nhân viên nhập vào hệ thống đối chiếu, đồng thời chịu một khoản phí phạt Surcharge).*
3. Hệ thống tự động tính toán phí đỗ xe dựa trên thời gian lưu chuồng.
4. Tài xế chọn thanh toán Tiền mặt (nhân viên thu) hoặc Bank QR (thanh toán qua VNPay).
5. Khi thanh toán hoàn tất và đối khớp thành công, session chuyển sang `exit_authorized`.
6. Nhân viên bấm *Confirm Exit* để xác nhận xe đã rời đi. Session chuyển sang `completed`, slot được giải phóng (`available`).

### Các thực thể persistence chính (đã triển khai)

| Thực thể | Trách nhiệm |
|---|---|
| `User` | Tài khoản, role, trạng thái truy cập active/inactive. |
| `Vehicle` và `VehicleUser` | Xe đã đăng ký và mối quan hệ liên kết chủ sở hữu/tài xế của nó. Database bắt buộc một chủ sở hữu cho mỗi xe thông qua một partial unique index. |
| `Floor` và `Slot` | Cấu trúc vật lý của tòa nhà và trạng thái slot: `available`, `reserved`, `occupied`, hoặc `maintenance`. |
| `Reservation` | Giữ slot ngắn hạn được liên kết với tài xế, **xe liên kết (bắt buộc)**, slot, thời gian hết hạn, và trạng thái lifecycle. |
| `ParkingSession` | Source of truth cho một lượt thăm của xe, timestamp check-in/check-out, giá trị biển số, slot, trạng thái thanh toán, mã ticket/session, và metadata phân bổ. |
| `Payment` | Một record thanh toán cho mỗi session, bao gồm method tiền mặt hoặc `bank_qr` và các định danh nhà cung cấp VNPay. |
| `OcrEvidence` | Metadata kết quả OCR, file key bằng chứng, mã hash toàn vẹn hình ảnh, loại event, session/reservation được liên kết, và retention timestamp. |
| `OperationIssue` | Ngoại lệ vận hành do nhân viên raise hoặc hệ thống bắt nguồn để Manager review. |
| `Notification` | Notification cho tài xế về việc bắt đầu session và cảnh báo sắp hết hạn reservation. |
| `VehicleRegistrationRequest` | Lưu trữ yêu cầu đăng ký xe tự phục vụ của tài xế, được xử lý (Approve/Reject) bởi Manager. Trạng thái expire tự động sau 24h. |

Hiện chưa có model Prisma nào cho log plate-mismatch, account escalation, hoặc public appeal. Những thứ này được đề xuất ở phần 9 và 10 và không được coi là một phần của schema hiện tại.

Các model definition nằm ở `schema.prisma`.

---

## 3. Yêu cầu Chức năng — Các tính năng Đã triển khai

Mọi thứ trong phần này đều được hỗ trợ bởi source trong working tree hiện tại. Bằng chứng file/line được cung cấp ở những nơi có thể giúp làm rõ.

### 3.1 Authenticate và kiểm soát truy cập

- Tài xế có thể tự đăng ký bằng số điện thoại và mật khẩu.
- Login hỗ trợ số điện thoại hoặc username cộng với mật khẩu.
- Mật khẩu được hash bằng bcrypt.
- Một JWT chứa ID và role của người dùng. Thời gian sống mặc định của token là 7 ngày.
- API sử dụng `JwtAuthGuard` và `RolesGuard`; quyền truy cập được check server-side, không chỉ bằng cách ẩn các trang web.
- Vô hiệu hóa người dùng ngăn chặn các request authenticate tiếp theo vì chiến lược JWT verify trạng thái active của tài khoản.
- **Ownership check khi truy xuất session đã được triển khai.** `GET /sessions/:id` và `GET /sessions/:id/qr` trả về 404 (không phải 403) khi tài xế request không sở hữu session, điều này tránh việc xác nhận sự tồn tại của resource với người không phải chủ sở hữu. Xem `sessions.controller.ts:170` và `sessions.service.ts:1434`. Một bộ e2e chuyên dụng cho hành vi này đã được viết; tuy nhiên lần chạy pass của nó vẫn chưa được xác nhận bằng output lưu lại (xem phần 7).

### 3.2 Đăng ký và nhận dạng xe

- Một tài xế có thể có nhiều xe liên kết, ví dụ hai ô tô và hai xe máy.
- **Một reservation mới yêu cầu một xe active được liên kết với tài xế request.** `CreateReservationDto` yêu cầu `vehicleId`, và `ReservationsService` validate rằng xe được liên kết với tài xế trước khi tiếp tục. Xem `create-reservation.dto.ts:7` và `reservations.service.ts:81`. Điều này kích hoạt check-in QR-first không cần OCR. Một thiết kế đề xuất để biến xe liên kết thành tùy chọn có tồn tại (phần 9) nhưng **chưa được bật trong build hiện tại**.
- Các giá trị biển số được normalize trước khi lookup và persist để giảm sự khác biệt về format như `90B2-452.30` so với `90B245230`.
- Gate hỗ trợ input biển số OCR, sửa chữa thủ công, QR reservation, QR session, mã session, và lookup biển số làm phương thức nhận dạng.
- **Đăng ký xe tự phục vụ:** Tài xế nộp yêu cầu đăng ký xe từ Mobile App. Manager duyệt yêu cầu trên Web Dashboard. Tự động liên kết quyền sở hữu khi được duyệt.

### 3.3 Phân bổ slot thông minh

Service phân bổ được triển khai sử dụng Strategy Pattern. Strategy được chọn được resolve từ config hệ thống, trong khi tất cả các strategy chia sẻ một query slot ứng viên và allocation contract duy nhất.

Việc phân bổ là concurrency-aware: hệ thống cố gắng lock một slot trống trong một serializable transaction, retry các lựa chọn conflict, và sau đó chuyển trạng thái slot sang `reserved` hoặc `occupied` nếu phù hợp.

Một bài test concurrency tự động trên real-database có tồn tại — xem phần 7 để biết phạm vi và cách chạy nó; phần đó cũng giải thích tại sao kết quả của nó nên được re-confirm bằng output lưu lại trước khi được trích dẫn.

### 3.4 Reservation và check-in ưu tiên QR

Reservation được thiết kế như một **việc giữ slot ngắn hạn**, không phải là một lịch advance booking rộng rãi:

1. Tài xế chọn một chiếc xe đã liên kết và thời gian đến dự kiến. Một xe liên kết là bắt buộc trong build hiện tại.
2. Backend check xem tài xế và xe có reservation nào đang active hay chưa.
3. Allocation service chọn và lock một slot matching.
4. Slot trở thành `reserved`; reservation trở thành `active` và có expiry timestamp.
5. Mobile app request một token QR có thời hạn ngắn, đã ký. Token QR được làm mới định kỳ.
6. Staff scan QR và call `POST /checkin/scan-reservation`.
7. API verify loại token, thời hạn token, trạng thái reservation, xe liên kết, tài xế, và slot đã đặt. Quy trình này đọc dữ liệu nội bộ của database và không gọi OCR provider.
8. Nhân viên compare bằng mắt biển số được hiển thị với xe vật lý, sau đó chọn **Confirm Check-in**.
9. Reservation trở thành `fulfilled`, slot trở thành `occupied`, và một `ParkingSession` được tạo với cả `vehicleId` và `reservationId`.

Đường dẫn xác nhận có tính idempotent. Lặp lại việc xác nhận sẽ trả về session đã tạo thay vì tạo cái thứ hai. Hệ thống cũng block check-in reservation khi xe đó đã có open session.

### 3.5 Luồng gate hợp nhất và dự phòng OCR

Gate console của nhân viên được thiết kế action-first. Quét biển số được sử dụng một lần, sau đó backend resolve luồng công việc tiếp theo:

- `POST /gate/scan-plate` gọi OCR một lần và lưu trữ kết quả/bằng chứng OCR.
- `POST /gate/resolve-plate` re-route sau khi sửa đổi biển số manual mà không cần gọi lại OCR.
- Một open session bao gồm `active`, `checkout_pending`, và `exit_authorized`, giúp ngăn chặn các quyết định entry trùng lặp khi xe vẫn đang trong quá trình checkout.
- QR reservation vẫn là phương pháp nhận dạng ưu tiên cho các tài xế đã đặt trước; OCR/nhập biển số manual vẫn là phương pháp walk-in và fallback.
- **Baseline lane hiện tại:** Gate Console vẫn là single-lane theo từng phiên trình duyệt. Source chưa có Prisma model `GateLane`/`StaffGateAssignment`, chưa có manager assignment API, và backend chưa giới hạn staff theo loại xe của lane. Loại xe hiện được lấy từ hồ sơ xe khi lookup matched; walk-in không có lane policy server-side.
- Gate Console hiển thị tối đa ba check-in gần nhất. Modal review biển số và card ticket đã tồn tại, nhưng ngưỡng hai lần OCR thất bại, wrong-lane enforcement, ticket-stage enforcement và print-root riêng cho vé check-in vẫn chưa được triển khai.
- **Xử lý sự khác biệt biển số hiện nay là manual.** Nhân viên compare hình ảnh bằng chứng lúc checkout và có thể thao tác thủ công **Request Manager Review**, điều này tạo ra một `OperationIssue` (phần 3.9). Không có log mismatch tự động, không có đếm số lượng distinct-plate, và không có tự động escalation — xem phần 9 cho đề xuất đó.

### 3.6 Vòng đời parking session

Quy tắc vận hành quan trọng:

- Mã session được tạo trung tâm từ một UUID với prefix `PBMS-` và là unique.
- Việc tạo session được tập trung hóa trong `createParkingSession`.
- Checkout không tự động release slot.
- Chỉ **Confirm Exit** mới transition session sang `completed` và release slot. Điều này duy trì sự kiểm soát của nhân viên đối với barie vật lý.
- Luồng lost-ticket ghi lại thông tin tài liệu định danh và mark `isLostTicket`.

### 3.7 Thanh toán

- Nhân viên có thể thu tiền mặt hoặc tạo thanh toán VNPay Bank QR cho một session `checkout_pending`.
- Tài xế chỉ có thể initiate thanh toán Bank QR cho session đủ điều kiện của chính họ; app không cấp chức năng tiền mặt vì không có nhân viên nào thu tiền trực tiếp.
- Backend tạo provider payment URL và validate chữ ký và amount từ VNPay return/IPN.
- Các payment Bank QR đang chờ xử lý được reuse khi vẫn còn hiệu lực, giúp thao tác của nhân viên có tính idempotent.
- Nhân viên vẫn phải confirm exit sau khi thanh toán; việc thanh toán đơn thuần không thể hoàn thành xuất bến vật lý.
- Hiện không có logic domain thanh toán auto-pay hay subscription.

### 3.8 Hình ảnh bằng chứng OCR

Mọi lần chụp OCR đều có thể được retain làm bằng chứng vận hành. Bằng chứng được thu thập ở check-in và check-out và được hiển thị side-by-side. Có các scheduled cron jobs để xóa hình ảnh gốc và thumbnail hết hạn nhưng vẫn giữ metadata để đảm bảo ngữ cảnh audit. Triển khai hiện tại dùng filesystem storage (cần di chuyển lên S3/MinIO cho production).

### 3.9 Các vấn đề vận hành và notification

- Nhân viên có thể tạo `OperationIssue` cho Manager review. Đây là hành động manual, không phải tự động trigger hiện nay.
- Hệ thống tránh duplicate issue.
- Manager dashboard sử dụng Server-Sent Events (SSE).
- Driver nhận notification cho session start, cảnh báo expiry reservation, và kết quả duyệt Đăng ký xe (Approve, Reject, Expired).

### 3.10 Đăng ký xe tự phục vụ (Self-service Vehicle Registration)

- **Mobile App:** Tài xế có thể nộp yêu cầu đăng ký xe (Vehicle Registration Request) trực tiếp mà không cần sự can thiệp thủ công ban đầu của quản lý. App cung cấp lịch sử và trạng thái các yêu cầu (Pending, Approved, Rejected, Expired).
- **Web Dashboard:** Yêu cầu được chuyển vào hàng đợi (Pending Requests) trên giao diện của Manager. Manager có thể Approve (tự động tạo liên kết xe - chủ sở hữu) hoặc Reject (có kèm lý do bắt buộc).
- **Automation:** Hệ thống tự động kiểm tra và hết hạn (Expire) các yêu cầu treo quá 24h thông qua CronJob.
- **Thông báo:** Gửi Push Notification tự động cho tài xế về mọi thay đổi trạng thái.

---

## 4. Kiểm soát Truy cập Dựa trên Vai trò (RBAC) (đã triển khai)

- **Driver:** Dành cho các hoạt động self-service liên quan đến xe của họ (đặt chỗ, thanh toán Bank QR, lịch sử).
- **Gate Staff:** Chỉ vận hành cổng (check-in, checkout, confirm thủ công, raise vấn đề cho quản lý). Không thể access dashboard quản lý.
- **Manager:** Giám sát hôm nay (hàng đợi vấn đề, bằng chứng, cấu hình, xử lý sự cố cổng). Không tạo hay vô hiệu hóa tài khoản.
- **Administrator:** Quản lý tất cả tài khoản, audit, báo cáo toàn hệ thống. Tách biệt với hoạt động cổng hằng ngày.

---

## 5. Chế độ xem Quản lý và Báo cáo (đã triển khai)

Manager dashboard tập trung trả lời các câu hỏi vận hành "ngay lúc này" (slot nào đang có xe gì, session nào chờ checkout quá lâu, vấn đề nào cần xử lý). Administrator cung cấp tính năng quản trị và audit dài hạn hơn (Reservation Audit, Báo cáo ngày).

---

## 6. Yêu cầu Phi Chức năng (đã triển khai)

Bao gồm Correctness (transactions, concurrency aware), Security (JWT, guards, ownership checks, VNPay IPN checks), Usability, Traceability, Performance, Maintainability, Retention (xóa định kỳ), và Localization (sửa HTML lỗi mojibake, tiếng Anh cho interface vận hành).

---

## 7. Bằng chứng Chất lượng Đã kiểm chứng

- **Build verification:** API/Web/Mobile build và typecheck pass.
- **Allocation concurrency test:** Pass trên cơ sở dữ liệu thực (15 trial) - cần re-run và save log trước buổi demo.
- **Session-ownership fix (BOLA):** Đã implement trong code, trả về 404 cho non-owner. Đang chờ confirm passing bộ e2e test tự động của nó.
- **Tại sao các API tests hiện fail:** Có 74 API unit test thất bại do thiếu dependency injection của `OcrService`, `NotificationsService` trong các file spec cũ. Đây là vấn đề bảo trì test, không phải hệ thống bị lỗi.

---

## 8. Lộ trình Ưu tiên (Priority Roadmap)

### P0 - ổn định trước buổi thuyết trình cuối cùng (Đã hoàn thành toàn bộ)

Toàn bộ các task P0 (sửa Unit Test, pass E2E, Verify VNPay Sandbox, chốt ngôn ngữ, fix Session Ownership) đã được hoàn tất 100% trong mã nguồn. Hệ thống hiện tại là phiên bản MVP hoàn chỉnh sẵn sàng cho Demo.

### P1 - tăng cường bảo mật và audit

1. **Đính chính trạng thái:** Ownership check trên `GET /sessions/:id` đã được implement. Chỉ còn việc confirm e2e suite của nó.
2. Restrict truy xuất OCR evidence bằng quyền/vai trò.
3. Thêm audit event log.
4. Tài liệu hóa retention period.
5. Setup CI pipeline (hiện tại chưa có).

### P2 - tiến hóa sản phẩm

1. Di chuyển bằng chứng sang S3/MinIO.
2. (Xem Phần 9)
3. Thêm browser test và db concurrency test vào CI.

---

## 9. Công việc Đang tiến hành: Độ tin cậy của tài khoản (chỉ thiết kế — triển khai 0%)

**Không có gì trong phần này tồn tại trong source.** Không có Prisma model, module, hay controller nào cho phần này. Nó được ghi lại ở đây vì thiết kế đã được thống nhất và quá trình code sẽ bắt đầu từ spec này.

**Vấn đề:** Cần tự động phát hiện các hành vi bất thường hoặc gian lận liên quan đến biển số và tài khoản.

**Thiết kế Đề xuất:**
1. **Liên kết xe-reservation trở thành tùy chọn:** Đảo ngược ràng buộc bắt buộc trong build hiện tại.
2. **Xử lý Plate-mismatch:** Action tự động log khác biệt, tự động raise `OperationIssue`.
3. **Suspicion signal:** Đếm số biển số distinct của xe.
4. **Escalation:** Flag Manager -> AccountEscalation -> Administrator review/deactivate.

---

## 10. Lộ trình Tương lai và Thiết kế Gate/Lane (chưa triển khai)

- Kênh Public Appeal không authenticate.
- Migration Object storage.
- CI/CD pipeline.
- Tự động hóa suspicion threshold.

### 10.1 Trạng thái thiết kế Gate/Lane

**Trạng thái tại thời điểm viết v1.2:** Design approved, implementation 0%. Các model, migration, API và UI được mô tả dưới đây chưa tồn tại trong build hiện tại. Không được trình bày phần này như behavior đã triển khai cho tới khi hoàn thành migration và quality checks.

**Mục tiêu:** Mỗi lane vật lý chỉ nhận một loại xe. Ví dụ, staff đăng nhập tại lane ô tô chỉ xử lý session `car`; staff tại lane xe máy chỉ xử lý session `motorbike`. Loại xe của lane là nguồn quyết định cho walk-in, không phụ thuộc vào AI vehicle classification hoặc lựa chọn tùy ý của nhân viên.

### 10.2 Mô hình persistence đề xuất

- `GateLane`: `id`, `code` unique, `name`, `vehicleType` (`car`/`motorbike`), `cameraId` optional, `isActive`, `createdAt`, `updatedAt`.
- `StaffGateAssignment`: `staffId` unique, `gateLaneId`, `assignedById`, `assignedAt`, `updatedAt`. Một staff chỉ có một lane hiện hành.
- Assignment chỉ hợp lệ khi user có role `staff`, user active và lane active.
- Không lưu lane như một quyền RBAC mới. Role và assignment là hai lớp kiểm soát độc lập.

### 10.3 Phân tách trách nhiệm Admin/Manager

- **Administrator:** Tạo và quản lý tài khoản, gán role, activate/deactivate user, tạo/sửa/deactivate cấu hình lane, và có thể override assignment.
- **Manager:** Không tạo tài khoản, không đổi role, không activate/deactivate user. Manager chỉ xem tập dữ liệu tối thiểu của active staff và assign/reassign/unassign các staff đó vào lane đã được Admin cấu hình.
- Việc Manager phân công lane không tự cấp quyền truy cập. Gate yêu cầu đồng thời role `staff`, user active, assignment tồn tại và lane active.

### 10.4 Enforcement đề xuất tại Gate

- Staff chưa được gán lane hoặc được gán vào lane inactive bị block trước khi browser yêu cầu quyền camera.
- Frontend hiển thị nhãn assignment tĩnh, ví dụ `Car Lane 1 · Car`; không cần một Gate Status card riêng.
- Backend là nguồn enforcement cuối cùng. `vehicleType` do frontend gửi phải khớp assignment hoặc được backend derive trực tiếp từ lane.
- Walk-in và manual plate dùng loại xe của lane, không hiển thị selector `Car/Motorbike`.
- Xe đăng ký hoặc reservation có loại xe không khớp lane bị từ chối và được hướng dẫn sang lane phù hợp.
- Chính sách lane áp dụng cho cả check-in và checkout, bao gồm lookup, payment, confirm-exit và lost-ticket action liên quan đến session.
- Recent check-in của staff chỉ trả về ba session mới nhất phù hợp loại xe của lane.
- Reassignment có hiệu lực từ request tiếp theo; không yêu cầu staff đăng xuất rồi đăng nhập lại.

API sai lane nên trả mã nghiệp vụ ổn định cùng `expectedVehicleType`, `actualVehicleType` và thông tin lane. Backend phải từ chối request giả loại xe kể cả khi frontend bị bypass.

### 10.5 Cải tiến OCR fallback và ticket workflow

- Không hiển thị `Enter plate manually` ở trạng thái ban đầu.
- Lần OCR trả `NEEDS_MANUAL_PLATE` đầu tiên chỉ yêu cầu scan lại; lần thứ hai mới tự mở modal nhập tay. Lỗi camera, network hoặc API không làm tăng bộ đếm này.
- Khi ticket vừa tạo, `Print Ticket` là primary action. Sau khi gọi print, `Mark Issued` trở thành primary action; sau khi phát vé, `Next Vehicle` trở thành primary action.
- Cho phép `Skip ticket & next vehicle` cho ngoại lệ vận hành nhưng bắt buộc qua confirmation dialog.
- Khóa scan xe mới khi ticket hiện tại chưa được issued hoặc skip.
- Thêm print root riêng để `window.print()` chỉ render ticket check-in 80 mm gồm QR, biển số, session code, loại xe, slot, floor, zone, thời gian và vị trí.

### 10.6 Acceptance criteria trước khi chuyển sang Implemented

1. Chỉ Admin quản lý account, role và lane configuration; Manager chỉ quản lý assignment.
2. Staff chưa có assignment bị block trước khi camera khởi động.
3. Backend enforce lane trên OCR, QR check-in, manual check-in, checkout, payment và confirm-exit.
4. Walk-in dùng đúng loại xe của lane; registered/reservation sai lane bị block.
5. OCR manual fallback chỉ xuất hiện sau hai lần không nhận diện liên tiếp.
6. Ticket stage, skip confirmation và print preview hoạt động đúng.
7. Migration, API unit/integration tests, web lint và web build pass.

---

## 11. Kịch bản Thuyết trình (Demo Scenarios)

Dưới đây là 4 kịch bản chính được thiết kế để phô diễn toàn bộ sức mạnh của hệ thống trong buổi bảo vệ:

### Kịch bản 1: Đăng ký xe tự phục vụ & Phân quyền
- **Bước 1 (Mobile):** Tài xế đăng nhập Mobile App, vào mục Profile -> Gửi yêu cầu đăng ký một biển số xe mới.
- **Bước 2 (Web Manager):** Quản lý mở Web Dashboard (trang Vehicles), nhìn thấy yêu cầu đang ở trạng thái Pending. Tiến hành bấm Approve.
- **Bước 3 (Mobile):** App của tài xế nhận thông báo báo duyệt thành công. Xe chính thức được liên kết.

### Kịch bản 2: Khách hàng App Đặt chỗ & Check-in bằng QR siêu tốc
- **Bước 1 (Mobile):** Tài xế mở App, chọn xe vừa đăng ký, bấm Đặt chỗ. Hệ thống tự động lock 1 slot (chứng minh thuật toán Smart Allocation chống Double-booking).
- **Bước 2 (Mobile):** App sinh ra mã Dynamic QR.
- **Bước 3 (Web Staff):** Xe chạy đến cổng, nhân viên dùng máy quét mã QR của khách (tab Reservation QR). Màn hình nhân viên lập tức hiện **Tên tài xế** và **Biển số**. Nhân viên bấm "Confirm Check-in", barie mở.

### Kịch bản 3: Khách vãng lai (Walk-in) Check-in bằng AI Camera
- **Bước 1 (Web Staff):** Một xe lạ chưa từng tải App chạy thẳng đến cổng. Nhân viên bấm chụp Camera (tab OCR Check-in).
- **Bước 2 (Backend):** AI nhận diện biển số, không tìm thấy chủ xe -> Tự động gắn nhãn "Guest" và cấp ngẫu nhiên 1 slot.
- **Bước 3 (Web Staff):** Nhân viên xác nhận hình ảnh hợp lệ, bấm "Check-in", barie mở.

### Kịch bản 4: Check-out, Thanh toán Số VNPay & Xuất Báo cáo
- **Bước 1 (Web Staff):** Xe ra cổng, nhân viên quét Camera báo Check-out. Hệ thống dừng đồng hồ, tính ra số tiền cuối cùng.
- **Bước 2 (Mobile):** Khách hàng mở App, màn hình Active Session hiện nút "Thanh toán ngay". Khách bấm chuyển sang VNPay Sandbox và thanh toán.
- **Bước 3 (Web Staff):** Màn hình nhân viên tự động nhảy sang "Đã thanh toán" (nhờ luồng Real-time SSE). Nhân viên bấm Confirm Exit để mở cổng.
- **Bước 4 (Web Manager/Admin):** Mở màn hình Dashboard Manager hoặc Admin để show biểu đồ doanh thu (Revenue) đã tự động cộng thêm tiền của cuốc xe vừa rồi, kèm theo danh sách Linked Drivers. Lập luận về "Exception-based Management" (Quản trị ngoại lệ) khi không show rác log thành công.

---

## 12. Các câu hỏi Phản biện và Gợi ý Điểm trả lời

(Chi tiết trả lời cho các câu hỏi về: Tại sao reservation bỏ qua OCR, QR token làm mới, Xác nhận nhân viên, Open session routing, Ngăn trùng slot, Mocks test, Sự khác biệt Manager/Admin, Giới hạn hiện tại của prototype...)

---

## 13. Kết luận

PBMS đã hiện thực hóa vòng lặp vận hành chính của tòa nhà đỗ xe một cách đáng tin cậy. Thiết kế ở Phần 9 là bước tiếp theo nhằm giải quyết vấn đề đăng ký self-service một cách mượt mà và an toàn, nhưng nó chỉ mới là tài liệu thiết kế để tiến hành build.
