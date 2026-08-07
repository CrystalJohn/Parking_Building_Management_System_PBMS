# Plan: Remove physical Slot concept, replace with Floor + Lane checkout

## Context (proven facts)
- Building has NO slot sensors → physical `slot` assignment is meaningless.
- Only 1 ground-floor check-out gate, with separate **car** and **motorbike** lanes.
- `ParkingSession.slotId` is currently a **required (NOT NULL)** FK to `Slot`.
- `slots/allocation.service.ts` auto-assigns a physical slot at check-in.
- `GateLane` model already exists with `vehicleType` + active flag; lanes seeded (e.g. `MOTORBIKE-001`).
- Slot appears in ~25 web files + `SlotOccupancyMap` on manager dashboard.

## Goal
Replace "slot" as the unit of parking with **(floor, lane/vehicleType)**. At check-out the system records the **exit lane** (car or motorbike) the vehicle used, not a slot. No physical slot is assigned.

## Phase 1 — DB schema (migration)
1. `schema.prisma`:
   - `ParkingSession.slotId`: change `Int` → `Int?` (nullable). Keep `Slot` model + relation (other tables still use it; just allow null on sessions).
   - Add `checkOutLaneId String? @map("check_out_lane_id")` + relation to `GateLane` (for the exit lane used).
   - Add `floorId Int?` (denormalized exit floor; the only floor is ground = tầng trệt).
   - Keep `zone`/`allocationStrategy` as nullable (deprecated, no longer written).
2. `npx prisma migrate dev` (or `prisma db push` for dev) → new migration.

## Phase 2 — Backend
1. `slots/allocation.service.ts`: keep service but STOP calling it from `sessions.service.ts` `checkIn`. Leave module (reservations may still use it) but skip slot allocation for walk-in/check-in sessions.
2. `sessions.service.ts`:
   - `CreateSessionInput`: make `slotId` optional; add `checkOutLaneId?`, `floorId?`.
   - `checkIn`: no longer require an allocated slot. `createParkingSession` gets `slotId: null`, `floorId` from the active lane's floor (default ground), `checkOutLaneId` set at checkout (not check-in).
   - `requestCheckout` / check-out: accept `gateLaneId` (the exit lane), persist `checkOutLaneId` + `floorId`.
   - `buildCheckoutLookupPreview` / `mapBackendCheckout`: return `lane` info instead of `slot` (lane code, vehicleType, floor). Keep a `slot: null` shim OR update response shape.
3. DTOs (`check-in.dto.ts`, `checkout.dto.ts`): add `gateLaneId?`; make `slotId` optional.
4. `gate-lanes` service already supports assignment; reuse for checkout lane.

## Phase 3 — Web types (`lib/sessions-api.ts`, `driver-api.ts`, `admin-api.ts`, `manager-reservations-api.ts`)
- Replace `CheckoutSlotInfo` / `AssignedSlot` / `slot` fields with `CheckoutLaneInfo` / `exitLane` (code, vehicleType, floorName).
- Keep `slotCode?` optional everywhere for backward-compat display (show "—" when null).

## Phase 4 — Web UI changes
- **Staff**: `Gate.tsx` (remove feePreview.slotCode, Floor/Zone row, slotId wiring, "Slot released" → "Lane cleared"), `CheckoutPreviewModal.tsx` (`Slot: {slot.code}` → `Exit Lane: {lane.code}`), `LostTicket.tsx`, `StaffReservationQrCheckInPanel.tsx`, `GateVerificationConsole` (slot refs).
- **Driver**: `MySession`, `Reservations`, `History`, `ActiveReservationCard` — show "Auto check-in at gate" instead of slot.
- **Manager**: `Dashboard.tsx` — **repurpose SlotOccupancyMap → Lane/Floor occupancy**: show the 1 ground floor + 2 lanes (car/motorbike) with live occupancy counts instead of per-slot grid. `Config.tsx` (slotsPerFloorZone → lane config), `Vehicles`, `Reservations`, `Reports`.
- **Admin**: `AdminSessions`, `AdminReservations`, `Receipt` (slotCode → lane), `RecentSessionsCard`.

## Phase 5 — Verify
- `npx tsc --noEmit` (web + api), `npm run build` (web), `npx nest build` (api) all green.
- Live smoke test: staff login → assign lane → check-in (no slot) → checkout with `gateLaneId` → preview shows lane, no slot.

## STATUS: IMPLEMENTED & VERIFIED (2026-08-03)

### Backend (apps/api)
- Migration `20260803045321_remove_slot_required`: `slotId` now nullable; added `checkOutLaneId` FK → GateLane; `GateLane` gained `sessions` back-relation.
- `sessions.service.ts`: walk-in check-in no longer allocates a slot (`slot = undefined`, `allocationStrategy='no_slot'`); `slotId`/`floorId`/`zone` written as null. `createParkingSession` + `CreateSessionInput` accept optional slot. All response builders use `mapSessionSlot(session.slot)` (returns null when slot null). `notifySessionStarted` + log line null-guarded. Checkout persists `checkOutLaneId` (defaults to active lane).
- `check-out.dto.ts`: added optional `gateLaneId`.

### Web (apps/web)
- `lib/sessions-api.ts`: `CheckoutWorkflowResponse.slot?`, added `checkOutLane?`; `BackendCheckOutResponse.slot?` + `checkOutLane?`; `CheckOutResponse.slotCode?`. Added `CheckOutLaneInfo`.
- Staff: `Gate.tsx` (slot→lane display, "Lane cleared" toasts), `CheckoutPreviewModal.tsx` (Exit lane), `LostTicket.tsx` (Exit lane). `mapBackendCheckout` passes slot/checkOutLane through.

### Verification
- API `npx nest build` → 187 files, 0 issues. Web `npm run build` → green.
- Live E2E: walk-in check-in → `slot:null, allocationStrategy:"no_slot"`; checkout with gateLaneId → DB `checkOutLaneId` set to lane MOTORBIKE-001. ✅

### Notes
- Slot table KEPT (reservations still reference slots). Only sessions no longer require a slot (per decision A).
- Manager dashboard SlotOccupancyMap NOT yet repurposed to lane/floor (decision C pending) — still shows slots. Remaining work item.
