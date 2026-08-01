# Unified Gate Console — Architecture Analysis & Implementation Plan

> **Status:** ✅ APPROVED BY USER (2026-07-31) — executing via subagent-driven-development.
> **Branch:** `feat/unified-gate-console` (base `c39b9bc`)
> **DB:** PostgreSQL `localhost:5432/pbms_dev` (local; NO push to GitHub)

---

## 1. Executive Summary

Replace Check-in/Check-out Tabs with a single **Gate Verification Console** that auto-determines the correct action (CHECKOUT / CHECKIN / MANUAL_REVIEW) based on vehicle lookup priority: **Active Session > Active Reservation > Unknown**.

---

## 2. Gap Analysis

### What Exists Today

| Component | Status | Notes |
|---|---|---|
| `GateService.resolvePlateMode()` | ✅ | Does session-first lookup, returns `CHECK_OUT` or `CHECK_IN` |
| `SessionsService.lookupOpenForGateByPlate()` | ✅ | Finds active session by canonical plate |
| `ReservationsService.findActiveByCanonicalPlate()` | ✅ | Finds active reservation by canonical plate |
| `POST /gate/scan-plate` | ✅ | OCR + auto-resolve |
| `POST /gate/resolve-plate` | ✅ | Manual plate + auto-resolve |
| `OperationIssue` model | ✅ | Audit table exists with `type`, `severity`, `note`, `createdById` |
| FE `GateScanResponse` type | ✅ | Already has `CHECK_IN`, `CHECK_OUT`, `NEEDS_MANUAL_PLATE` modes |
| FE Check-in/Check-out Tabs | ✅ | Just added — needs removal |
| FE `StaffOcrCheckInPanel` | ✅ | Camera + OCR + check-in flow |
| FE `CheckOutPanel` | ✅ | Full checkout workflow (payment, exit) |

### What's Missing (Gaps)

| Gap | Priority | Description |
|---|---|---|
| **No `vehicleStatus` field** | 🔴 Critical | `GateScanResponse` returns mode but not vehicle status (`ACTIVE_SESSION` / `ACTIVE_RESERVATION` / `UNKNOWN`) |
| **No `recommendedAction` field** | 🔴 Critical | Response needs explicit `recommendedAction` instead of implicit `mode` |
| **No `reservationId` in gate response** | 🟡 High | When reservation found, response should include `reservationId` for checkout linking |
| **No override audit logging** | 🟡 High | Override flow needs dedicated audit table or reuse `OperationIssue` |
| **FE has no unified console component** | 🔴 Critical | Current `GateOperationsPanel` + `CheckOutPanel` are separate panels, not a unified view |
| **No `POST /gate/verify` endpoint** | 🟡 High | User spec requests a dedicated verify endpoint (separate from scan-plate) |
| **Reservation check missing in current flow** | 🟡 High | `resolvePlateMode()` only checks session → vehicle lookup. It doesn't check reservation explicitly. |

---

## 3. Files Affected

### Backend (apps/api)

| File | Action | Changes |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `GateAuditLog` model (or extend `OperationIssue`) |
| `src/gate/dto/verify-plate.dto.ts` | **Create** | DTO for `POST /gate/verify` |
| `src/gate/gate.service.ts` | Modify | Add `verifyPlate()` method with 3-step priority logic |
| `src/gate/gate.controller.ts` | Modify | Add `POST /gate/verify` endpoint |
| `src/gate/gate.module.ts` | Modify | Import `ReservationsModule` |
| `src/gate/gate.service.spec.ts` | Modify | Add tests for verifyPlate |
| `src/gate/dto/index.ts` | Modify | Export new DTO |

### Frontend (apps/web)

| File | Action | Changes |
|---|---|---|
| `src/lib/sessions-api.ts` | Modify | Add `GateVerifyResponse` type + `verifyGatePlate()` function |
| `src/pages/staff/Gate.tsx` | Modify | Remove Tabs, add unified console state |
| `src/pages/staff/GateVerificationConsole.tsx` | **Create** | New unified console component |
| `src/pages/staff/StaffOcrCheckInPanel.tsx` | Keep | Still used for camera capture |
| `src/pages/staff/StaffReservationQrCheckInPanel.tsx` | Keep | Still used for QR reservation check-in |
| `src/pages/staff/CheckOutPanel.tsx` (inside Gate.tsx) | Keep | Still used for checkout workflow after confirm |

---

## 4. Backend Architecture

### 4.1 New Endpoint: `POST /gate/verify`

```typescript
// Request
POST /gate/verify
Body: {
  canonicalPlate: string;    // normalized plate (e.g., "59A12345")
  ocrEvidenceId?: string;    // link evidence to session
  staffId: string;           // from JWT
}

// Response
{
  plate: "43A-272.08",              // display format
  canonicalPlate: "43A27208",       // normalized
  vehicleStatus: "ACTIVE_SESSION" | "ACTIVE_RESERVATION" | "UNKNOWN",
  recommendedAction: "CHECKOUT" | "CHECKIN" | "MANUAL_REVIEW",
  confidence: 0.99,                 // OCR confidence (null if manual)
  sessionId?: string,               // if ACTIVE_SESSION
  reservationId?: string,           // if ACTIVE_RESERVATION
  subMode?: "PAYMENT_REQUIRED" | "PAYMENT_PENDING" | "READY_TO_EXIT",  // checkout sub-state
}
```

### 4.2 GateDecisionService Logic (inside GateService)

```
verifyPlate(plate, ocrEvidenceId?, staffId):
  1. normalizedPlate = normalizePlateNumber(plate)
  2. plateDisplay = toDisplay(normalizedPlate)

  3. // STEP 1: Check active session (highest priority)
     session = prisma.parkingSession.findFirst({
       where: {
         status: { in: [active, checkout_pending, exit_authorized] },
         OR: [
           { licensePlate: normalizedPlate },
           { plateNumberConfirmed: normalizedPlate },
         ],
       },
       include: { slot, payment, driver, vehicle }
     })

     if session:
       return {
         vehicleStatus: "ACTIVE_SESSION",
         recommendedAction: "CHECKOUT",
         confidence,
         sessionId: session.id,
         subMode: mapCheckoutSubMode(session.status),
       }

  4. // STEP 2: Check active reservation
     reservation = reservationsService.findActiveByCanonicalPlate(normalizedPlate)

     if reservation:
       return {
         vehicleStatus: "ACTIVE_RESERVATION",
         recommendedAction: "CHECKIN",
         confidence,
         reservationId: reservation.id,
       }

  5. // STEP 3: Unknown
     return {
       vehicleStatus: "UNKNOWN",
       recommendedAction: "MANUAL_REVIEW",
       confidence,
     }
```

### 4.3 Override Audit Logging

**Option A (Recommended): New `GateAuditLog` model**

```prisma
model GateAuditLog {
  id              String   @id @default(uuid())
  staffId         String   @map("staff_id")
  canonicalPlate  String   @map("canonical_plate")
  vehicleStatus   String   @map("vehicle_status")       // ACTIVE_SESSION | ACTIVE_RESERVATION | UNKNOWN
  recommendedAction String @map("recommended_action")    // CHECKOUT | CHECKIN | MANUAL_REVIEW
  actualAction    String   @map("actual_action")         // What staff actually did
  reason          String?                               // Staff-provided reason
  sessionId       String?  @map("session_id")
  reservationId   String?  @map("reservation_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([staffId, createdAt], map: "idx_gate_audit_staff")
  @@index([canonicalPlate, createdAt], map: "idx_gate_audit_plate")
  @@map("gate_audit_logs")
}
```

**Option B: Reuse `OperationIssue`** — Less clean, but no migration needed. Use `type = 'manual_review'` for overrides.

**Decision: Option A** — Cleaner separation, better query patterns for audit reports.

---

## 5. Frontend Architecture

### 5.1 Unified Console Flow

```
┌─────────────────────────────────────────────┐
│  Gate Operations        [Bike lane · Motor] │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │        LIVE CAMERA                  │   │
│  │  [video feed]                       │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─ Scan Result ──────────────────────┐   │
│  │  Detected Plate   43A-272.08       │   │
│  │  Status            ACTIVE SESSION  │   │
│  │  Recommended       CHECK OUT       │   │
│  │  Confidence        99%             │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [Confirm Check-out]  [Override ▾]         │
│                                             │
│  ┌─ Recent Sessions ─────────────────┐   │
│  │  (last 3 check-ins)               │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.2 State Machine

```
IDLE → SCANNING → RESULT_DISPLAYED → CONFIRMED/ERROR
                                      ↓
                               OVERRIDE_DIALOG → CONFIRMED/ERROR
```

### 5.3 Component Structure

```
Gate.tsx (main page)
├── GateVerificationConsole.tsx (new - unified console)
│   ├── Camera + Scan button (reuses existing capture logic)
│   ├── ScanResult card (plate, status, action, confidence)
│   ├── ConfirmButton (primary action)
│   ├── OverrideDialog (dropdown + reason input)
│   └── RecentSessionsCard (existing)
├── StaffOcrCheckInPanel.tsx (kept - used when override → CHECKIN)
├── StaffReservationQrCheckInPanel.tsx (kept - QR check-in path)
└── CheckOutPanel.tsx (inside Gate.tsx - kept - used after CONFIRM CHECKOUT)
```

---

## 6. Database Impact

### New Table: `gate_audit_logs`

- **Migration required**: Yes (`prisma migrate dev`)
- **Data volume**: ~100-500 rows/day (staff override events only — most scans don't override)
- **Indexes**: `(staffId, createdAt)`, `(canonicalPlate, createdAt)`
- **No data loss risk**: Additive migration only

### No Schema Changes to Existing Models

- `ParkingSession` — no changes
- `Reservation` — no changes
- `OcrEvidence` — no changes

---

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Breaking existing check-in flow** | 🔴 High | Keep `StaffOcrCheckInPanel` as-is for override → CHECKIN path. New console only replaces the initial scan→decision step |
| **Breaking existing checkout flow** | 🔴 High | `CheckOutPanel` unchanged — console delegates to it after CONFIRM CHECKOUT |
| **Reservation not found when expected** | 🟡 Medium | Handle gracefully — if reservation expired between OCR and confirm, show error and suggest MANUAL_REVIEW |
| **Race condition: session completed between scan and confirm** | 🟡 Medium | Re-verify session status on confirm action |
| **Camera permission denial** | 🟢 Low | Existing fallback: manual plate entry |
| **Override abuse** | 🟡 Medium | Audit log + manager review dashboard already exists via `OperationIssue` |

---

## 8. Rollback Strategy

### If backend changes break gate flow:

1. **Revert git commit** — all backend changes are additive (new endpoint + new table)
2. **Rollback migration**: `prisma migrate reset` or delete the `gate_audit_logs` table
3. **FE reverts**: Revert `Gate.tsx` to previous tab-based version
4. **Zero data loss**: `gate_audit_logs` is audit-only, no business data

### If frontend console is buggy:

1. **Feature flag**: Wrap new console in `import.meta.env.VITE_USE_UNIFIED_GATE === 'true'`
2. **Fallback**: Keep old tab-based UI as backup
3. **Gradual rollout**: Enable for one gate lane first

---

## 9. Implementation Phases

### Phase 1: Backend (Gate Decision Service)
- Add `GateAuditLog` model + migration
- Create `POST /gate/verify` endpoint
- Implement `verifyPlate()` with 3-step priority
- Unit tests

### Phase 2: Frontend (API Layer)
- Add `GateVerifyResponse` type
- Add `verifyGatePlate()` API function

### Phase 3: Frontend (Unified Console)
- Create `GateVerificationConsole` component
- Wire camera capture → verify → result display
- Wire confirm action → delegate to existing checkout/checkin flows
- Override dialog with reason

### Phase 4: Frontend (Remove Tabs)
- Remove `Tabs` from `Gate.tsx`
- Replace `GateOperationsPanel` with `GateVerificationConsole`
- Keep all child components (CheckOutPanel, StaffOcrCheckInPanel, etc.)

### Phase 5: Testing
- Backend unit tests for verifyPlate()
- Integration test: OCR → verify → confirm checkout
- Integration test: OCR → verify → confirm checkin
- Integration test: unknown vehicle → manual review
- Override audit log verification

---

## 10. Test Cases

### Scenario 1: Active Session → CHECKOUT
- Input: plate `43A27208` with active session
- Expected: `{ vehicleStatus: "ACTIVE_SESSION", recommendedAction: "CHECKOUT", sessionId: "..." }`

### Scenario 2: Active Reservation → CHECKIN
- Input: plate `43A27208` with active reservation, no session
- Expected: `{ vehicleStatus: "ACTIVE_RESERVATION", recommendedAction: "CHECKIN", reservationId: "..." }`

### Scenario 3: Unknown Vehicle → MANUAL_REVIEW
- Input: plate `43A27208` with no session, no reservation
- Expected: `{ vehicleStatus: "UNKNOWN", recommendedAction: "MANUAL_REVIEW" }`

### Scenario 4: Session > Reservation (priority)
- Input: plate `43A27208` with both active session and active reservation
- Expected: `{ vehicleStatus: "ACTIVE_SESSION", recommendedAction: "CHECKOUT" }`

### Scenario 5: Override — staff overrides CHECKOUT → CHECKIN
- Input: override with reason "Wrong vehicle, force check-in"
- Expected: audit log created, check-in proceeds

### Scenario 6: Override — staff overrides CHECKIN → MANUAL_REVIEW
- Input: override with reason "Plate not recognized"
- Expected: audit log created, manual review flow

---

## 11. Delivered-by Approval Checklist

- [ ] Backend: `POST /gate/verify` returns correct `vehicleStatus` + `recommendedAction`
- [ ] Backend: Priority order SESSION > RESERVATION > UNKNOWN
- [ ] Backend: Override audit log persisted
- [ ] Frontend: Unified console replaces tabs
- [ ] Frontend: Camera → scan → result → confirm flow works
- [ ] Frontend: Override dialog with reason
- [ ] Tests: All scenarios pass
- [ ] No regression: existing check-in/checkout flows still work

---

## 12. Task Breakdown (detailed briefs for implementers)

### Global Constraints (binding — reviewers get these verbatim)

1. **Verify response shape** (plan §4.1): `plate` (display format), `canonicalPlate`, `vehicleStatus` ∈ `ACTIVE_SESSION | ACTIVE_RESERVATION | UNKNOWN`, `recommendedAction` ∈ `CHECKOUT | CHECKIN | MANUAL_REVIEW`, `confidence` (number | null), `sessionId?`, `reservationId?`, `subMode?` ∈ `PAYMENT_REQUIRED | PAYMENT_PENDING | READY_TO_EXIT`.
2. **Decision priority**: Active Session > Active Reservation > Unknown.
3. **GateAuditLog model**: exact fields/names/table/index names as in §4.3 Option A (verbatim block).
4. **Endpoints**: `POST /gate/verify`, `POST /gate/audit-log` — same guards as existing gate endpoints (JwtAuthGuard + RolesGuard, Role.staff). `staffId` comes from JWT, never from the body.
5. **FE**: Tabs (from commits b7a2126/9521433) must be removed; `CheckOutPanel`, `StaffOcrCheckInPanel`, `StaffReservationQrCheckInPanel` must remain and only be wired, not rewritten.
6. **Feature flag** `VITE_USE_UNIFIED_GATE` is NOT required (rollback is git revert).
7. **DB**: migrations run against `localhost:5432/pbms_dev` via `prisma migrate dev`. Additive only — no changes to existing models.

---

## Task 1: GateAuditLog Prisma model + migration

**Goal:** Add the `GateAuditLog` audit table so every gate override is recorded.

**Requirements (exact):**

1. In `apps/api/prisma/schema.prisma`, add a `GateAuditLog` model after the `OperationIssue` model, with EXACTLY these fields and mappings (from plan §4.3 Option A — use verbatim):

   ```prisma
   model GateAuditLog {
     id               String   @id @default(uuid())
     staffId          String   @map("staff_id")
     canonicalPlate   String   @map("canonical_plate")
     vehicleStatus    String   @map("vehicle_status")        // ACTIVE_SESSION | ACTIVE_RESERVATION | UNKNOWN
     recommendedAction String  @map("recommended_action")    // CHECKOUT | CHECKIN | MANUAL_REVIEW
     actualAction     String   @map("actual_action")         // what staff actually did
     reason           String?                                // staff-provided reason
     sessionId        String?  @map("session_id")
     reservationId    String?  @map("reservation_id")
     createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

     @@index([staffId, createdAt], map: "idx_gate_audit_staff")
     @@index([canonicalPlate, createdAt], map: "idx_gate_audit_plate")
     @@map("gate_audit_logs")
   }
   ```

   Follow the schema file's existing alignment/comment conventions. Field names, `@map` names, `@@index` maps are binding. **Use `@db.Timestamptz(3)` on `createdAt`** — it is the schema-wide DateTime convention (Task 1 landed both a create migration and an alter migration because the first version omitted it; do not repeat).

2. Run the migration against the local DB (PostgreSQL `localhost:5432`, db `pbms_dev`), from `apps/api`:
   `npx prisma migrate dev --name add_gate_audit_logs`
   (this also regenerates the Prisma client; confirm the generate step ran or run `npx prisma generate`.)

3. Verify the API still typechecks (repo typecheck command — e.g. `npx tsc --noEmit -p apps/api/tsconfig.json`).

4. Commit `apps/api/prisma/schema.prisma` + the new migration folder (and client artifacts if the repo tracks generated output).

**Not in scope:** no unit tests (schema-only change — exercised by Task 3's tests), no seed data, no endpoints, no FE changes.

**Definition of done:** model exists with the exact fields above; migration `add_gate_audit_logs` applied to `pbms_dev`; typecheck clean; commit created.

---

## Task 2: Backend — POST /gate/verify decision endpoint

**Goal:** Expose the gate decision engine: priority **Active Session > Active Reservation > Unknown**, with the exact response shape from plan §4.1.

**Requirements:**

1. **DTO** — create `apps/api/src/gate/dto/verify-plate.dto.ts` following the style of the existing gate DTOs (`ScanPlateDto`/`ResolvePlateDto` — same imports, e.g. `VIETNAMESE_PLATE_REGEX`).
   - `canonicalPlate: string` — required, `@IsString()`, `@Matches(VIETNAMESE_PLATE_REGEX)` (the canonical form, e.g. `43A27208`, matches that regex).
   - `ocrEvidenceId?: string` — optional, `@IsUUID()`.
   - **Do NOT add `staffId` to the DTO** — it comes from the JWT (plan §4.1's body sample shows "from JWT").
   - Export from `apps/api/src/gate/dto/index.ts`.

2. **Service method** — in `apps/api/src/gate/gate.service.ts` add:
   `verifyPlate(input: { canonicalPlate: string; ocrEvidenceId?: string; staffId?: string }): Promise<GateVerifyResponse>`
   Logic (do NOT query `prisma.parkingSession` directly — reuse existing services):
   - Normalize: `canonical = normalizePlateNumber(plate)`; `display = toDisplay(canonical)` (same helpers the existing resolve flow uses).
   - Confidence: if `ocrEvidenceId` provided, load the evidence row (`prisma.ocrEvidence.findUnique`); use its confidence; evidence absent → `confidence = null` (do not throw). Otherwise `confidence = null`.
   - STEP 1: `this.sessionsService.lookupOpenForGateByPlate(canonical)` → session found ⇒ return `{ vehicleStatus: 'ACTIVE_SESSION', recommendedAction: 'CHECKOUT', sessionId: session.id, subMode, ... }`. `subMode` maps session status/payment to `PAYMENT_REQUIRED | PAYMENT_PENDING | READY_TO_EXIT` — reuse an existing derivation if one exists in the codebase (check checkout service/controller and FE `GateCheckoutSubMode` semantics); otherwise implement a small private helper with unit tests pinning each sub-state.
   - STEP 2: `this.reservationsService.findActiveByCanonicalPlate(canonical)` → reservation found ⇒ `{ vehicleStatus: 'ACTIVE_RESERVATION', recommendedAction: 'CHECKIN', reservationId: reservation.id, ... }`.
   - STEP 3: otherwise `{ vehicleStatus: 'UNKNOWN', recommendedAction: 'MANUAL_REVIEW', ... }`.
   - Every branch returns `plate`, `canonicalPlate`, `vehicleStatus`, `recommendedAction`, `confidence`; optional fields only when applicable. Follow the file's existing `GateScanResponse` type-declaration patterns.

3. **Controller** — in `apps/api/src/gate/gate.controller.ts` add `POST verify` (route `/gate/verify`), guarded like the existing endpoints, body `VerifyPlateDto`, `staffId` read from the authenticated request exactly as the existing handlers do.

4. **Module** — add `ReservationsModule` to `apps/api/src/gate/gate.module.ts` imports (currently Auth, Ocr, Sessions, Vehicles, GateLanes).

5. **Unit tests** — extend `apps/api/src/gate/gate.service.spec.ts` (and controller spec if one exists) in the file's existing `Test.createTestingModule` + mock style. Minimum coverage:
   - Active session ⇒ CHECKOUT with sessionId + correct subMode.
   - No session + active reservation ⇒ CHECKIN with reservationId.
   - No session + no reservation ⇒ UNKNOWN / MANUAL_REVIEW.
   - Session AND reservation both present ⇒ ACTIVE_SESSION wins.
   - confidence passed through as null when no evidence id; loaded from evidence when provided.
   - Unknown/missing evidence id does not throw.
   Run the gate suites; all pass, output pristine.

**Definition of done:** DTO + service + controller + module wiring + tests; `POST /gate/verify` implements all three scenarios + priority; tsc clean; gate suites green.

---

## Task 3: Backend — override audit endpoint

**Goal:** Persist staff override decisions to `gate_audit_logs` (model from Task 1) via a new endpoint.

**Requirements:**

1. **DTO** — create `apps/api/src/gate/dto/record-gate-audit.dto.ts` (export from `dto/index.ts`):
   - `canonicalPlate` — required string, same regex validation as verify.
   - `vehicleStatus` — required, validated against `ACTIVE_SESSION | ACTIVE_RESERVATION | UNKNOWN`.
   - `recommendedAction` — required, validated against `CHECKOUT | CHECKIN | MANUAL_REVIEW`.
   - `actualAction` — required, validated against `CHECKOUT | CHECKIN | MANUAL_REVIEW`.
   - `reason` — optional string.
   - `sessionId?` — optional UUID. `reservationId?` — optional UUID.
   - Validate enum strings with `@IsIn` (or `@IsEnum` with shared literals — match codebase style).

2. **Service** — `recordOverride(input)` (or the codebase-idiomatic name) in `GateService`: creates a `GateAuditLog` row via prisma (staffId from JWT input), returns the created row. Insert-only — no business logic beyond the insert.

3. **Controller** — `POST /gate/audit-log`, same guards as Task 2.

4. **Tests** — spec cases: creates a row with all fields; reason optional; invalid enum values rejected (match existing DTO validation test style).

**Not in scope:** no FE changes, no reads/queries of the audit table.

**Definition of done:** DTO + service + controller + tests; row lands in `gate_audit_logs`; tsc clean; gate suites green.

---

## Task 4: FE API layer

**Goal:** Typed API functions for verify + audit.

**Requirements:** In `apps/web/src/lib/sessions-api.ts`, following the existing `scanGatePlate`/`resolveGatePlate` patterns and this file's type-export conventions:

- `GateVerifyResponse` interface matching the BE response: `plate`, `canonicalPlate`, `vehicleStatus: 'ACTIVE_SESSION' | 'ACTIVE_RESERVATION' | 'UNKNOWN'`, `recommendedAction: 'CHECKOUT' | 'CHECKIN' | 'MANUAL_REVIEW'`, `confidence: number | null`, `sessionId?`, `reservationId?`, `subMode?: 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT'`.
- `verifyGatePlate(payload: { canonicalPlate: string; ocrEvidenceId?: string })` → `POST /gate/verify`.
- `GateAuditRequest` interface + `recordGateOverride(payload)` → `POST /gate/audit-log` (fields per Task 3 DTO; `staffId` NOT sent from the client).
- TypeScript check passes (repo's web typecheck command).
- No component changes. Tests: only if `sessions-api.ts` already has colocated tests — otherwise skip (thin axios wrapper).

**Definition of done:** types + both functions exported; web typecheck clean.

---

## Task 5: GateVerificationConsole component + test

**Goal:** The unified console: camera → verify → result → confirm/override. See plan §5.1 mockup and §5.2 state machine.

**Requirements:** Create `apps/web/src/pages/staff/GateVerificationConsole.tsx` (new file).

- State machine: `IDLE → SCANNING → RESULT_DISPLAYED → CONFIRMED | ERROR`, with `OVERRIDE_DIALOG` reachable from `RESULT_DISPLAYED`.
- **Camera capture: reuse the exact capture/OCR mechanism used by `StaffOcrCheckInPanel`** (its hook/component, how it saves `OcrEvidence`, and what it returns: plate + evidence id). Do NOT reimplement OCR. Read `StaffOcrCheckInPanel.tsx` and mirror its wiring.
- After capture: normalize the detected plate with `normalizePlateForApi` (from `plate-format.ts`), call `verifyGatePlate({ canonicalPlate, ocrEvidenceId })`, then render the **Scan Result card**: detected plate (display), status (ACTIVE_SESSION / ACTIVE_RESERVATION / UNKNOWN), recommended action (Check out / Check in / Manual review), confidence as % (or `—` when null).
- Primary button label per result: `Confirm Check-out` | `Confirm Check-in` | `Review Manually`; click → `onConfirm(payload)` prop (parent wires the real flow; this component only reports). Override button → opens the override dialog (Task 6 component); its confirm → `onConfirm({ ...payload, override: { action, reason } })`.
- Manual plate entry fallback (plan §7 risk: camera denied → manual input) using the existing manual-plate pattern from the current page.
- Verify failure ⇒ ERROR state with retry.
- Keep the file focused (under ~350 lines); if it grows beyond that, stop and report `DONE_WITH_CONCERNS` — do not split files on your own.
- Colocated test `GateVerificationConsole.test.tsx` following the repo's FE test conventions (see `RecentSessionsCard.test.tsx`): renders idle; renders the result card for each of the 3 `vehicleStatus` values with the correct button label; override opens the dialog; error state on failure. Mock the api module the way existing tests do.

**Definition of done:** component + test; FE jest suite green; tsc clean.

---

## Task 6: OverrideGateActionDialog component + test

**Goal:** The override dialog: action picker + mandatory reason.

**Cross-task contract (from Task 5's review — binding):** `GateVerificationConsole` does NOT render the dialog itself. It exposes `onOpenOverride(payload)` (payload = the `GateConfirmPayload` without `override`) and the Override button only renders when that prop is provided. The PARENT (Task 7) must pass `onOpenOverride`, render this dialog, and on dialog confirm call `onConfirm({ ...payload, override: { action, reason } })`.

**Requirements:** Create `apps/web/src/components/ui/override-gate-action-dialog.tsx` following the repo's existing dialog patterns (shadcn `Dialog` components; study an existing one — e.g. `RequestManagerReviewDialog` — for the idiomatic shape):

- Props: `open`, `onOpenChange`, `plate`, `currentAction` (the recommended action), `onConfirm(action, reason)`.
- Contents: read-only note showing the recommended action; radio/select of the three actions (`CHECKOUT`/`CHECKIN`/`MANUAL_REVIEW`) defaulting to the opposite of the recommended one (scenarios 5/6: staff overrides CHECKOUT → CHECKIN); required reason textarea; Confirm disabled until reason is non-empty; Cancel.
- Colocated test: opens; Confirm disabled without reason; enabled with reason; `onConfirm` called with chosen action + reason.

**Definition of done:** component + test; FE jest green; tsc clean.

---

## Task 7: Gate.tsx — remove tabs, integrate console

**Goal:** Replace the tabs UI with the unified console, wiring confirm/override to the real flows. **Highest-risk task — read `Gate.tsx` fully before touching anything.**

**Requirements:**

1. Remove the tabs wrapper (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` + `activeTab` state) added in commits `b7a2126`/`9521433`.
2. Render `GateVerificationConsole` where the tab panels now sit. Preserve the lane-selector behavior currently at the top of `GateOperationsPanel` (Bike lane · Motor) — keep it on the page (either keep `GateOperationsPanel`'s header above the console or move the lane switcher into Gate.tsx's shell; behavior must be unchanged). **Pass `onOpenOverride` to the console and render the Task 6 `OverrideGateActionDialog`; on dialog confirm, call the console's `onConfirm` with `{ ...payload, override: { action, reason } }` (audit-before-act applies — see item 3). Do NOT leave `onOpenOverride` unpassed, or the Override button silently disappears.**
3. Wire console callbacks:
   - `onConfirm` with `recommendedAction: CHECKOUT` → activate the existing `CheckOutPanel` flow for that session (same state transitions the tab previously triggered: session data load → checkout workflow states active → checkout_pending → exit_authorized → completed). Reuse whatever state/loader currently feeds `CheckOutPanel`.
   - `onConfirm` with `recommendedAction: CHECKIN` (or override → CHECKIN) → route into the existing check-in flow (the `StaffOcrCheckInPanel` confirm path; the QR path in `StaffReservationQrCheckInPanel` stays reachable per plan §5.3). Reuse existing handlers — do not duplicate logic.
   - `onConfirm` with `MANUAL_REVIEW` → open the existing `RequestManagerReviewDialog` flow if present on this page; otherwise show an inline note and still allow override.
   - `onConfirm` with an override payload → **first** call `recordGateOverride(...)`, **then** proceed with the chosen action; if the audit call fails, show an error and do NOT proceed (audit-before-act).
4. Keep `hideLookupCard`/`initialWorkflow` prop behavior if the component is used elsewhere with those props (grep callers; update them only if the props no longer make sense — don't break other routes).
5. Update/extend existing Gate tests if any exist (grep `Gate.test.tsx`/`Gate.spec.tsx`); otherwise a light smoke test only if the repo has an established page-level test pattern.
6. Do NOT add the `VITE_USE_UNIFIED_GATE` flag (rollback is git revert).

**Definition of done:** tabs gone; console integrated; check-in, checkout, manual-review, and override flows all reachable through the console; FE jest + tsc green; QR check-in path still works.

**Console nits to fix in this task** (recorded Minors from Task 5's review — small edits in `GateVerificationConsole.tsx`, keep them minimal):
- Add `'ERROR'` to the `scanDisabled` set (Scan Plate / Enter plate manually render enabled during ERROR but silently no-op).
- After ERROR → Try Again with a still-denied camera, the auto-manual-fallback only exists on first mount — make restart failure also fall back to manual entry (or surface the manual button).
- In `GateVerificationConsole.test.tsx`: replace bare `defineProperty`/assignment mocks on `HTMLMediaElement.prototype`/`URL` with `jest.spyOn` + `jest.restoreAllMocks()`.

---

## Task 8: Gate flow integration tests (BE)

**Goal:** Prove the end-to-end decision + override audit flow against the real local DB.

**Requirements:** Create `apps/api/src/gate/gate-flow.integration.spec.ts` following the setup/teardown pattern of the existing `apps/api/src/verification/*.integration.spec.ts` files (mirror their DB handling; skip gracefully if the DB is unreachable, matching that suite's behavior).

- Seed: vehicle + active `ParkingSession` for plate A; vehicle + active `Reservation` (no session) for plate B; nothing for plate C.
- Cases:
  1. `POST /gate/verify` plate A ⇒ `ACTIVE_SESSION`/`CHECKOUT` with `sessionId` + `subMode`.
  2. `POST /gate/verify` plate B ⇒ `ACTIVE_RESERVATION`/`CHECKIN` with `reservationId`.
  3. `POST /gate/verify` plate C ⇒ `UNKNOWN`/`MANUAL_REVIEW`.
  4. `POST /gate/audit-log` (override CHECKOUT→CHECKIN with reason) ⇒ 201 and a `GateAuditLog` row exists with the exact fields incl. staffId.
- Clean up seeded rows after the run.

**Definition of done:** integration spec passes (or skips when DB unreachable) with evidence in the report.

---

**✅ APPROVED BY USER 2026-07-31 — implementation via subagent-driven-development; NO push to GitHub (local only).**
