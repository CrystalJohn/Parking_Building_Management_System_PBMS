# Parking Building Management System (PBMS)
## Software Requirements Specification and Implementation Report

**Version:** 1.0  
**Status:** Implementation snapshot, 12 July 2026  
**System type:** Parking building management system for web-based operations and a mobile driver application  
**Primary stack:** NestJS, Prisma, PostgreSQL, Vite/React, React Native/Expo

---

## 1. Purpose and Scope

PBMS digitizes the operational flow of a multi-floor parking building. It supports four business roles: Driver, Gate Staff, Manager, and Administrator.

The system manages vehicle identification, parking-slot allocation, reservation, check-in, checkout, payment, operational incidents, evidence images, and management reporting.

The core design principle is **staff-confirmed operation**:

- The system may recognize a plate, resolve a reservation, calculate a fee, or identify an exception.
- A staff member must review the result and explicitly confirm check-in, payment, and vehicle exit.
- The system does not automatically open a barrier or complete a physical entry/exit.

### In scope

- Walk-in check-in through OCR plate recognition.
- Reservation check-in through a short-lived QR token, without calling the OCR provider.
- Unified plate scan that routes staff to check-in or checkout from the current session state.
- Check-out, cash payment, VNPay Bank QR payment, and manual exit confirmation.
- Four configurable smart slot-allocation strategies.
- Driver reservation, QR display, active session, history, and notifications.
- Evidence capture and retrieval for check-in and checkout.
- Manager operational queue and Administrator audit/reporting surfaces.

### Out of scope

- Automated barrier hardware control.
- Production-grade camera/ANPR infrastructure.
- AI training or custom vehicle/plate recognition model training.
- Advance booking across arbitrary future time windows; the implemented reservation is a short-term arrival hold.
- A production object-storage deployment, CDN, disaster recovery, or legal retention policy.

---

## 2. Architecture

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
       Local evidence storage (compressed JPG + thumbnail)
                              |
            External providers: Plate Recognizer, VNPay
```

The API is the source of truth for business state. The web and mobile clients do not directly mutate database state or call the payment provider. In particular, only the backend creates and verifies VNPay payment requests.

### Principal persistence entities

| Entity | Responsibility |
|---|---|
| `User` | Accounts, role, active/inactive access state. |
| `Vehicle` and `VehicleUser` | Registered vehicle and its linked owner/driver relationship. The database enforces one owner per vehicle through a partial unique index. |
| `Floor` and `Slot` | Physical building structure and slot status: `available`, `reserved`, `occupied`, or `maintenance`. |
| `Reservation` | Short-lived parking hold with linked driver, linked vehicle, slot, expiry, and lifecycle status. |
| `ParkingSession` | Source of truth for a vehicle visit, check-in/check-out timestamps, plate values, slot, payment state, ticket/session code, and allocation metadata. |
| `Payment` | One payment record per session, including cash or `bank_qr` method and VNPay provider identifiers. |
| `OcrEvidence` | OCR result metadata, evidence file keys, image integrity hash, event type, linked session/reservation, and retention timestamps. |
| `OperationIssue` | Staff-raised or system-derived operational exception for manager review. |
| `Notification` | Driver notifications for session start and reservation expiry warning. |

The model definitions are located in [schema.prisma](../apps/api/prisma/schema.prisma).

---

## 3. Functional Requirements and Implemented Features

### 3.1 Authentication and access control

- Drivers can self-register using phone number and password.
- Login supports phone number or username plus password.
- Passwords are hashed with bcrypt.
- A JWT contains the user ID and role. Default token lifetime is seven days.
- The API uses `JwtAuthGuard` and `RolesGuard`; access is checked server-side, not only by hiding web pages.
- Deactivating a user prevents subsequent authenticated requests because the JWT strategy verifies account activity.

Relevant implementation: [auth.service.ts](../apps/api/src/auth/auth.service.ts), [auth.module.ts](../apps/api/src/auth/auth.module.ts), and [roles.guard.ts](../apps/api/src/auth/guards/roles.guard.ts).

### 3.2 Vehicle registration and identity

- A driver can have multiple linked vehicles, for example two cars and two motorbikes.
- A new reservation requires a selected active vehicle linked to the requesting driver.
- Plate values are normalized before lookup and persistence to reduce formatting differences such as `90B2-452.30` versus `90B245230`.
- The gate supports OCR plate input, manual correction, reservation QR, session QR, session code, and license plate lookup as identification methods.

A self-service vehicle registration workflow allows drivers to submit vehicle information along with a photo of their registration certificate (cà vẹt xe) as evidence. Managers must review this evidence before approving the request and linking the vehicle.

### 3.3 Smart slot allocation

The allocation service is implemented using the Strategy Pattern. The selected strategy is resolved from the active system configuration, while all strategies share a single candidate-slot query and allocation contract.

| Strategy | Intended behavior |
|---|---|
| `balanced_occupancy` | Balances utilization between floors. Default strategy. |
| `fair_distance_based` | Scores slots using walking distance, occupancy, and a fairness penalty. |
| `lowest_floor` | Prefers the lowest suitable floor. |
| `random` | Random suitable-slot selection for simulation/control comparison. |

Allocation is concurrency-aware: the system attempts to lock an available slot within a serializable transaction, retries conflicting selections, and then transitions the slot to `reserved` or `occupied` as appropriate.

Relevant implementation: [allocation.service.ts](../apps/api/src/slots/allocation.service.ts) and [reservations.service.ts](../apps/api/src/reservations/reservations.service.ts).

### 3.4 Reservation and QR-first check-in

Reservation is designed as a **short-term parking hold**, not a broad advance-booking calendar:

1. Driver selects one linked vehicle and a planned arrival time.
2. The backend checks that neither the driver nor the vehicle already has an active reservation.
3. The allocation service chooses and locks a matching slot.
4. The slot becomes `reserved`; the reservation becomes `active` and has an expiry timestamp.
5. The mobile application requests a signed, short-lived QR token. The QR token is refreshed periodically.
6. Staff scans the QR and calls `POST /checkin/scan-reservation`.
7. The API verifies token type, token expiry, reservation status, linked vehicle, driver, and reserved slot. This flow reads internal database data and does not call the OCR provider.
8. Staff visually compares the displayed plate with the physical vehicle, then selects **Confirm Check-in**.
9. The reservation becomes `fulfilled`, the slot becomes `occupied`, and a `ParkingSession` is created with both `vehicleId` and `reservationId`.

The confirmation path is idempotent. Repeated confirmation returns the already-created session rather than creating a second session. The system also blocks a reservation check-in when the same vehicle already has an open session.

If a reservation is cancelled or expires, the corresponding reserved slot is released. A scheduled job runs every minute to expire overdue reservations, and another scheduled job sends a one-time warning shortly before expiry.

Relevant implementation: [checkin.controller.ts](../apps/api/src/sessions/checkin.controller.ts), [reservations.service.ts](../apps/api/src/reservations/reservations.service.ts), and [sessions.service.ts](../apps/api/src/sessions/sessions.service.ts).

### 3.5 Unified gate flow and OCR fallback

The staff gate console is deliberately action-first. A plate scan is used once, then the backend resolves the next workflow:

```text
Staff captures plate image
        |
POST /gate/scan-plate
        |
Plate Recognizer returns plate + confidence + evidence ID
        |
Is there an open session for this normalized plate?
        |
    Yes ------------------> Checkout preview and fee workflow
    No -------------------> Check-in preview and slot allocation workflow
```

- `POST /gate/scan-plate` calls OCR once and stores the OCR result/evidence.
- `POST /gate/resolve-plate` re-routes after manual plate correction without paying for another OCR call.
- An open session includes `active`, `checkout_pending`, and `exit_authorized`, preventing duplicate entry decisions while a vehicle is still in the operational exit flow.
- Reservation QR remains the preferred identification method for reserved drivers; OCR/manual plate remains the walk-in and fallback method.

Relevant implementation: [gate.controller.ts](../apps/api/src/gate/gate.controller.ts), [gate.service.ts](../apps/api/src/gate/gate.service.ts), and [Gate.tsx](../apps/web/src/pages/staff/Gate.tsx).

### 3.6 Parking session lifecycle

```text
Check-in confirmed
      |
      v
    active
      |
      | staff starts checkout; fee is calculated
      v
checkout_pending
      |
      | staff confirms cash / VNPay callback marks payment paid
      v
exit_authorized
      |
      | staff confirms the vehicle has physically left
      v
  completed  --> slot becomes available
```

Important operational rules:

- A session code is generated centrally from a UUID with the `PBMS-` prefix and is unique.
- Session creation is centralized in `createParkingSession`, so walk-in and reservation sessions persist the same essential fields.
- Checkout does not automatically release a slot.
- Only **Confirm Exit** transitions the session to `completed` and releases the slot. This preserves staff control over the barrier/physical gate.
- Lost-ticket flow records identity-document information and marks `isLostTicket` for appropriate handling.

Relevant implementation: [sessions.service.ts](../apps/api/src/sessions/sessions.service.ts) and [sessions.controller.ts](../apps/api/src/sessions/sessions.controller.ts).

### 3.7 Payment

- Staff may collect cash or create a VNPay Bank QR payment for a `checkout_pending` session.
- A driver may initiate only a Bank QR payment for their own eligible session; the app does not offer cash because no staff member is physically receiving money.
- The backend creates the provider payment URL and validates VNPay return/IPN signatures and amounts.
- Pending Bank QR payments are reused when still valid, which makes repeated staff clicks idempotent.
- Staff must still confirm exit after payment; payment alone cannot complete a physical exit.

Relevant implementation: [payments.controller.ts](../apps/api/src/payments/payments.controller.ts) and [payments.service.ts](../apps/api/src/payments/payments.service.ts).

### 3.8 OCR evidence images

Every OCR capture can be retained as operational evidence. Evidence is relevant for staff, manager, and administrator review when a customer disputes a plate, ticket, payment, or exit.

#### Evidence lifecycle

1. Staff submits a gate image to the OCR endpoint.
2. The API creates an `OcrEvidence` metadata record.
3. The original input image is compressed to JPEG, constrained to a configured maximum width, and stored in a date-based directory such as `uploads/ocr-evidence/YYYY/MM/DD/`.
4. A smaller JPEG thumbnail is generated for fast dashboard rendering.
5. Database metadata stores the full-image key, thumbnail key, MIME type, compressed size, SHA-256 hash, OCR plate, confidence, confirmed plate, camera/gate metadata, timestamps, staff, and linked session/reservation.
6. The evidence is associated with either `check_in` or `check_out` and is displayed side-by-side in the staff checkout workflow.
7. Manager and administrator can use the protected evidence endpoint to inspect linked session evidence.
8. A daily 03:00 cron process deletes expired full images, then expired thumbnails, and removes stale orphan files. The metadata remains so the system can show that the image has expired rather than silently losing audit context.

The current deployment uses filesystem storage configured by `OCR_EVIDENCE_STORAGE_ROOT`. For production scale, this storage adapter should be replaced or extended with S3/MinIO-compatible object storage while keeping the database metadata and API contract unchanged.

Relevant implementation: [ocr-evidence-storage.service.ts](../apps/api/src/ocr-evidences/ocr-evidence-storage.service.ts), [ocr-evidence-retention.service.ts](../apps/api/src/ocr-evidences/ocr-evidence-retention.service.ts), and [ocr-evidences.controller.ts](../apps/api/src/ocr-evidences/ocr-evidences.controller.ts).

### 3.9 Operational issues and notifications

- A staff member can submit an `OperationIssue` when a plate mismatch, payment issue, reservation issue, or other exception needs supervisory help.
- The system prevents duplicate open issues for the same context.
- Manager and administrator see an open/in-review/resolved queue.
- The manager console receives create/update/resolve events using Server-Sent Events (SSE), rather than relying only on periodic polling.
- Drivers receive persistent notifications for a session start and a reservation that is about to expire.

Relevant implementation: [operation-issues.controller.ts](../apps/api/src/operation-issues/operation-issues.controller.ts), [operation-issues.service.ts](../apps/api/src/operation-issues/operation-issues.service.ts), and [notifications.service.ts](../apps/api/src/notifications/notifications.service.ts).

---

## 4. Role-Based Access Control

| Role | Main responsibilities | Explicit access | Main restrictions |
|---|---|---|---|
| Driver | Reserve parking, present QR, pay, and view own parking activity. | Own vehicles, own reservations, reservation QR, own active/completed sessions, own notifications, driver Bank QR payment. | Cannot access staff gate, other drivers' reservations, user administration, pricing/configuration, reports, or operation queue. Cannot select cash payment from mobile. |
| Gate Staff | Operate entry/exit and manually confirm real-world actions. | Gate OCR scan, reservation QR scan, check-in, checkout, cash confirmation, VNPay QR generation, exit confirmation, ticket issuance, lost-ticket handling, recent gate history, OCR evidence. | Cannot manage users, configure prices/building/allocation strategy, change slot status, or access manager/admin dashboards. Barrier control remains manual and out of scope. |
| Manager | Supervise today's operations and handle exceptions. | Operations queue and SSE notifications, payment monitoring, current slot/session monitoring, reservation monitoring, reports, evidence review, pricing/building/allocation strategy configuration, vehicle-user linking, slot status update. | Cannot create/deactivate user accounts. Does not perform routine staff check-in/checkout actions through the manager UI. |
| Administrator | Govern accounts and audit system-wide operational health. | User CRUD/deactivation, dashboard, reservation audit, operational flags, pending payment view, evidence drill-down, manager-level reports/configuration/operation APIs. | Does not use the staff gate workflow. System administration is separated from day-to-day gate operation. |

The web route definitions reinforce the intended experience, while API role guards enforce authority at the server. See [AppRoutes.tsx](../apps/web/src/routes/AppRoutes.tsx) and the controller role annotations under `apps/api/src`.

---

## 5. Management and Reporting Views

### Manager

The manager role is designed for **today's operation**, not generic user administration. The key questions are:

- Which slot is occupied, by which plate, and for how long?
- Which sessions are abnormally long, checkout-pending, or exit-authorized but not exited?
- What issue has staff escalated and who owns its resolution?
- Is a payment waiting or anomalous?
- Do check-in and checkout evidence images support the staff decision?

The manager occupancy map is intended to present current capacity and risky slots by floor/zone, with visual severity for conditions such as long-active session, prolonged checkout pending, and cross-day parking.

### Administrator

The administrator role provides governance and audit:

- Manage every account, including other administrator accounts.
- Audit capacity, reservations, flags, payments, and selected-date reports.
- Review evidence for session-linked operational flags.
- Verify that reservations consume/release capacity correctly and that QR reservation usage is measurable.

The Reservation Audit page should answer only operationally relevant questions: reserved capacity, active reservations awaiting arrival, reservations nearing expiry, expired/released holds, and QR reservation fulfillment. It is not intended to duplicate the driver reservation screen.

---

## 6. Non-Functional Requirements

| Area | Requirement / implemented approach |
|---|---|
| Correctness | Database transactions and retries protect slot assignment and reservation expiration/release. Session and reservation flows prevent duplicate active states. |
| Security | JWT authentication, server-side role guards, bcrypt passwords, ownership checks on reservation and driver-payment paths, VNPay signature and amount validation. |
| Usability | QR-first reservation path, one-scan OCR routing, manual plate correction without OCR re-charge, staff confirmation at important state changes. |
| Traceability | Session code, timestamps, staff IDs, payment references, issue records, and OCR evidence metadata create an audit trail. |
| Performance | Thumbnail generation avoids rendering full images in operational lists. OCR is invoked once per scan. Slot strategies share candidate queries. |
| Maintainability | NestJS modules separate responsibilities; allocation uses Strategy Pattern; OCR evidence storage is a dedicated service; session creation is centralized. |
| Retention | Evidence images are compressed and cleaned by scheduled retention jobs. Database metadata records deletion/expiry status. |
| Localization | Operational web screens are being standardized to English. Payment-return HTML still contains legacy Vietnamese strings and should be corrected before final demonstration. |

---

## 7. Current Quality Status

### Build verification (12 July 2026)

| Check | Result |
|---|---|
| API production build | Pass |
| Web production build | Pass; Vite reports one non-blocking large-chunk warning. |
| Mobile TypeScript check | Pass |
| API unit tests | 205 passing, 74 failing, 2 skipped; 14 suites pass, 3 fail, 2 skip. |

### Why the API tests currently fail

The failing unit tests are mostly a **test-maintenance issue caused by dependency injection**, not an automatic proof that the production feature fails.

In a NestJS unit test, the service being tested is instantiated without the whole application. Each constructor dependency is replaced by a small controlled fake called a **mock**. For example, `SessionsService` depends on `OcrService` and `NotificationsService`, but the old tests created it without those newly-added mocks. NestJS therefore stops before the test body runs and reports that it cannot resolve the dependency.

The known failures are:

| Suite | Cause | Correct remediation |
|---|---|---|
| `sessions.service.spec.ts` | Test module does not provide `OcrService` after the service gained that dependency. | Add a minimal `OcrService` mock with only the methods exercised by each scenario. |
| `reservations.service.spec.ts` | Test module does not provide `NotificationsService` after expiry-warning/session features were added. | Add a `NotificationsService` mock, normally `createForUser: jest.fn()`. |
| `gate.service.spec.ts` | Existing OCR mock lacks `linkEvidenceToCheckout()`. | Add `linkEvidenceToCheckout: jest.fn()` and assert it when checkout evidence linking is expected. |

Mocks are useful because they make a unit test deterministic, fast, cheap, and independent of real OCR/VNPay/database availability. They do **not** replace integration testing. The project should retain separate integration tests using a real test database for transactions, unique constraints, and slot races, plus a small end-to-end test suite for the complete gate flows.

### Release assessment

The project is suitable for an academic demonstration after targeted manual verification. It is not yet production-ready because the API suite is not all green and full cross-module end-to-end verification is incomplete.

---

## 8. Priority Roadmap

### P0 - stabilize before final demonstration

1. Repair the three broken unit-test fixtures and restore a fully green API test suite.
2. Run a manual test script for reservation QR check-in, OCR walk-in check-in, OCR checkout, cash/VNPay payment, and manual exit confirmation.
3. Verify evidence persistence end-to-end: capture, database link, thumbnail/full-image fetch, staff comparison screen, manager/admin audit screen, and retention behavior.
4. Verify VNPay sandbox return/IPN with valid, duplicate, invalid-signature, and amount-mismatch cases.
5. Standardize remaining legacy Vietnamese/mojibake strings in system-facing responses and payment-return UI.

### P1 - strengthen security and audit

1. Ensure every driver-facing `GET /sessions/:id` and `GET /sessions/:id/qr` request performs an ownership check before returning data. The controller comments state this intent, but the current method signatures do not pass the current driver ID into those service calls.
2. Restrict direct OCR-evidence retrieval by relation/role where needed, not only by possession of an evidence UUID.
3. Add an audit event log for sensitive configuration changes, account deactivation, staff overrides, and evidence access.
4. Document the evidence retention period and consent/privacy policy.

### P2 - product evolution

1. Implement automatic initial validation for vehicle registration evidence using OCR or AI before manager review.
2. Ensure strict retention rules and scheduled cleanup for evidence files stored on object storage.
3. Add explicit plate-mismatch escalation with a staff override reason and manager review record.
4. Add richer manager occupancy cards: vehicle/evidence thumbnail, plate, check-in time, duration, slot, and severity.
5. Add end-to-end browser tests and database-backed concurrency tests to the CI pipeline.

---

## 9. Demonstration Script

Use this sequence to demonstrate the system coherently:

1. Log in as Driver and show linked vehicles.
2. Create a reservation for one selected vehicle; show that a matching slot is reserved.
3. Open the active reservation and show its refreshed QR code.
4. Log in as Gate Staff. Scan the QR, show plate/driver/slot/payment information, visually confirm, and create the parking session. Explain that OCR is not called in this branch.
5. Show that the slot becomes occupied and the driver receives a session-started notification.
6. Demonstrate a walk-in vehicle using **Scan Plate**. Show OCR evidence and the route to check-in.
7. Scan a plate with an open session. Show automatic routing to checkout, fee calculation, entry/exit evidence comparison, payment selection, and manual confirmation of exit.
8. As Manager, show an operational issue or risky session and evidence review.
9. As Administrator, show user management, reservation audit, and reports/flags.

---

## 10. Defense Questions and Suggested Answer Points

### Why does the reservation flow bypass OCR?

Because the driver has already linked a vehicle to an account and created an active reservation. The QR contains a short-lived signed reference, so the backend can retrieve trusted reservation, vehicle, driver, and slot data directly from its own database. OCR remains a fallback for walk-in vehicles or unreadable/invalid QR codes. Staff still compares the real plate with the displayed plate and confirms manually.

### Why is a QR token refreshed instead of using a static QR code?

A short-lived signed token reduces the usefulness of screenshots shared with another person. The token is valid only for an active, unexpired reservation and is checked again by the backend before check-in.

### Why does staff still need to confirm if the system already recognizes the plate or QR?

Parking is a cyber-physical process. The system can identify and calculate, but it cannot guarantee that the actual vehicle at the gate is correct. Manual confirmation preserves accountability and prevents unattended automatic entry/exit.

### Why do you use `open session` instead of only `active session` when routing OCR scans?

An `active` session means the car is parked. A car can also be in `checkout_pending` or `exit_authorized` while it has not physically left. All three states are still open operationally, so they must route to checkout rather than allowing an incorrect new check-in.

### How do you prevent two users from receiving the same slot?

Reservation allocation uses a serializable transaction, locks the candidate slot, retries conflicts, and changes the slot state within the same transaction. This is more reliable than selecting a slot in one query and updating it later without concurrency protection.

### Why do you keep both `licensePlate`, `plateNumberOcr`, and `plateNumberConfirmed`?

`plateNumberOcr` preserves the machine output, `plateNumberConfirmed` records staff correction/approval, and `licensePlate` preserves compatibility with existing session/reporting paths. Storing all three supports auditability when OCR differs from the final decision.

### How are evidence images stored without filling the disk immediately?

The API compresses the full image, creates a small thumbnail, stores only storage keys and metadata in PostgreSQL, and runs scheduled cleanup for expired full images, thumbnails, and orphan files. For production, the same adapter boundary can target object storage instead of local disk.

### Why are there mock objects in your tests?

Mocks substitute external or secondary dependencies so that a unit test checks only one service's decision logic. They make tests repeatable and fast. Real database constraints, file storage, OCR provider behavior, and VNPay callbacks need additional integration/end-to-end tests; mocks are not claimed to replace those tests.

### What is the difference between Manager and Administrator?

Manager is responsible for current operational health: capacity, exceptions, payments, evidence, configuration, and resolving staff issues. Administrator governs user access and system-wide audit/reporting. This separation avoids giving operational users unrestricted account-management authority.

### What is the main limitation of the current prototype?

The main limitations are incomplete green test coverage, local rather than object storage for evidence, no hardware barrier integration, and some remaining hardening work around ownership checks and audit logging. These are explicitly documented as roadmap items rather than hidden.

---

## 11. Conclusion

PBMS implements the main operational loop of a parking building: identify vehicle, allocate/hold capacity, confirm entry, track the session, calculate payment, confirm physical exit, and retain evidence for later audit. Its key contribution is not simply OCR; it combines OCR fallback, QR-first reservation check-in, transaction-aware allocation, staff-confirmed state transitions, and evidence-backed operational review in one consistent workflow.
