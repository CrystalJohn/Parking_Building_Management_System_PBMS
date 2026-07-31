# Plate Normalization Architecture (Raw / Canonical / Display) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend the single source of truth for Vietnamese license plate normalization — `PlateFormatter` service with explicit `rawPlate` / `canonicalPlate` / `displayPlate` stored in DB and returned by APIs — so the frontend performs zero plate formatting and only renders what the backend sends.

**Architecture:** A new backend `PlateFormatter` service (`.normalize()` / `.toDisplay()` / `.parse()`, vehicle-kind inferred from plate pattern — no vehicleType passed in) feeds all storage and API layers: `OcrEvidence` (audit history: raw/canonical/display), `Vehicle` (canonical unique + display), `ParkingSession` (display snapshot at check-in; canonical snapshot already exists as `plateNumberConfirmed`). All existing fields (`ocrPlate`, `plateNumber`, `licensePlate`, `plateConfirmed`) keep their exact semantics for backward compatibility; new fields are additive. Existing canonicalizer `normalizePlateNumber` delegates to `PlateFormatter.normalize` so the system has one canonical implementation. Frontend display call sites switch from `formatPlateForDisplay()` to backend-provided display fields, then the FE formatter is deleted. Sprint 4 (fuzzy matching, Smart Check-out) is the explicit future foundation — an optional task at the end.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL/Supabase, Jest 29 (API), ts-jest + Jest (web), React 19 + Vite (web), class-validator DTOs.

## Global Constraints

### Step 0 — Locked conventions (do not code until these are agreed)

| Concept | Used for | Example | Rules |
|---|---|---|---|
| **Canonical** | Search, matching, OCR comparison, reservation lookup | `30A12345`, `59X123456` | Uppercase A-Z + 0-9 only. NO `-`, NO `.`, NO space. |
| **Display** | UI rendering only | `30A-123.45`, `59X1-234.56` | Per VN standard, computed ONLY by backend `PlateFormatter.toDisplay()`. |
| **Raw** | Audit / debugging AI output | `30a12345` | Exactly what OCR/input produced. Never used for search or matching. |

- Constraint 1: DO NOT change semantics of existing `ocrPlate`, `plateNumber`, `licensePlate`, `plateConfirmed`, `plate` fields.
- Constraint 2: Introduce explicit new fields only: `rawPlate`, `canonicalPlate`, `displayPlate` (plus `plateDisplay` naming on Vehicle/ParkingSession per domain convention).
- Constraint 3: `Vehicle` stores canonical (`plateNumber`, already `@unique`) + display (`plateDisplay`).
- Constraint 4: `ParkingSession` snapshots plate info at check-in — canonical snapshot already exists as `plateNumberConfirmed` (set from `normalizePlateNumber` at `sessions.service.ts:151`); this plan adds the `plateDisplay` display snapshot. NEVER read `vehicle.plateNumber` live to render a historical session's plate.
- Constraint 5: Backend `PlateFormatter` is the single source of truth. Frontend must not perform any plate formatting (no dashes/dots added client-side).
- Constraint 6: Migration must preserve backward compatibility (existing API fields unchanged; new fields additive; FE falls back to canonical when display is null).
- Constraint 7: Never search/matching by display. Every plate-keyed DB query uses canonical.
- All UI copy is English (no Vietnamese strings in new code).
- Plate patterns (Vietnamese standard): car = `^\d{2}[A-Z]\d{5}$` (8 chars, e.g. `30A12345` → display `30A-123.45`); motorbike = `^\d{2}[A-Z]\d\d{5}$` (9 chars, e.g. `59X345678` → display `59X3-456.78`). Non-matching canonical → `displayPlate: null`, status `PARTIAL`/`INVALID`.
- Repo root: `D:\SEMESTER 8\WDP\Parking_Building_Management_System_PBMS`. API workdir: `apps/api`. Web workdir: `apps/web`.
- Pre-existing test failures to ignore (NOT caused by this work): `src/vehicles/vehicles.service.spec.ts` (references missing `linkUser` method — suite cannot compile), `src/vehicle-registrations/*.spec.ts` (missing PrismaService provider in test module).
- FE functions `normalizePlate()` and `guessVehicleType()` referenced by user do NOT exist in this codebase (verified by grep). FE cleanup scope = delete `formatPlateForDisplay()` only. `normalizePlateForApi` (input sanitization at API boundary — no dashes/dots added) and `formatVehicleType` (vehicle-type label, not plate formatting) are KEPT.

---

## Verified current state (facts this plan is based on)

- `normalizePlateNumber` (`apps/api/src/vehicles/vehicles.service.ts:439`) = `(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')` — this IS the canonical form already; every plate-keyed query already goes through it: `sessions.lookupOpenForGateByPlate` (`sessions.service.ts:1612-1613`), `vehicles.matchPlate`/`lookupPlate` (`vehicles.service.ts:154/301`), check-in `matchedVehicle` (`sessions.service.ts:151-172`). This plan delegates it to `PlateFormatter.normalize` (single implementation).
- NO plate-based reservation lookup exists today. Check-in resolves reservations by `reservationId`/`reservationCode` (QR) or `driverId` fallback (`sessions.service.ts:222-249`). `ReservationsService` has no findByPlate. Step 4 of the plan adds `findActiveByCanonicalPlate()` as the canonical contract + an audit rule.
- `ParkingSession` already snapshots canonical at check-in: `plateNumberConfirmed` (`sessions.service.ts:151` → `:704`). Missing piece = display snapshot `plateDisplay`.
- `OcrEvidence` already has `ocrPlate`, `ocrConfidence`, `capturedAt` (`schema.prisma:525-532`) — audit history exists; missing piece = `rawPlate`/`canonicalPlate`/`displayPlate`.
- Vehicle creation happens in exactly one place: `vehicle-registrations.service.ts:193` (`tx.vehicle.create` on registration approval).
- `GateScanResponse` (`gate.service.ts:13-38`) has `plateOcr`/`plateConfirmed` — missing `plateDisplay`.
- FE `formatPlateForDisplay` used in 14 files (list in Task 6/7).

## File Structure

**Sprint 1 — Foundation:**
- Create: `apps/api/src/plates/plate-formatter.ts` — `PlateFormatter` object (normalize/toDisplay/parse/inferKind), single source of truth
- Create: `apps/api/src/plates/plate-formatter.spec.ts` — unit tests
- Create: `apps/api/src/plates/index.ts` — exports
- Modify: `apps/api/prisma/schema.prisma` — 3 models get new columns
- Create: migration via `prisma migrate dev`
- Create: `apps/api/scripts/backfill-plate-display.mjs` — one-off backfill

**Sprint 2 — API contract, reservation lookup, FE cleanup:**
- Modify: `apps/api/src/plate-recognition/plate-recognition.service.ts` (+ spec) — `PlateScanResult` + recognize() expose `canonicalPlate`/`displayPlate`
- Modify: `apps/api/src/ocr/ocr.types.ts`, `apps/api/src/ocr/ocr.service.ts` (+ spec) — `OcrRecognizeResponse` gains raw/canonical/display; evidence records persist them
- Modify: `apps/api/src/vehicles/vehicles.service.ts` — delegate `normalizePlateNumber` → `PlateFormatter.normalize`; expose `plateDisplay` in responses
- Modify: `apps/api/src/vehicle-registrations/vehicle-registrations.service.ts` — set `plateDisplay` on vehicle create/approve
- Modify: `apps/api/src/gate/gate.service.ts` (+ spec) — `GateScanResponse` gains `plateDisplay`
- Modify: `apps/api/src/reservations/reservations.service.ts` (+ spec) — `findActiveByCanonicalPlate()`
- Modify: `apps/web/src/lib/sessions-api.ts`, `apps/web/src/lib/plate-recognition-api.ts` — types gain display fields
- Modify: `apps/web/src/pages/staff/StaffOcrCheckInPanel.tsx`, `apps/web/src/pages/staff/Gate.tsx`, `apps/web/src/pages/staff/StaffReservationQrCheckInPanel.tsx` — render backend display fields

**Sprint 3 — Session snapshot + OCR history:**
- Modify: `apps/api/src/sessions/sessions.service.ts` — snapshot `plateDisplay` at check-in; expose in session mappers
- Modify: `apps/api/src/ocr-evidences/ocr-evidences.service.ts` — evidence responses expose raw/canonical/display

**Sprint 4 — Future foundation (optional):**
- Create: `apps/api/src/plates/plate-match.ts` + spec — `PlateMatch` interface + similarity engine (NOT wired into checkout yet)

**Frontend cleanup:**
- Modify: `apps/web/src/lib/plate-format.ts` — DELETE `formatPlateForDisplay`; keep `normalizePlateForApi` + `isValidVietnamesePlate` + `formatVehicleType`
- Modify: `apps/web/src/lib/plate-format.spec.ts` — remove formatter tests
- Modify (display call sites — replace `formatPlateForDisplay(x)` with backend-provided display field):
  - `apps/web/src/pages/staff/StaffOcrCheckInPanel.tsx`, `apps/web/src/pages/staff/Gate.tsx`, `apps/web/src/pages/staff/StaffReservationQrCheckInPanel.tsx`
  - `apps/web/src/pages/admin/AdminSessions.tsx`, `apps/web/src/pages/admin/AdminReportsFlags.tsx`
  - `apps/web/src/pages/manager/Vehicles.tsx`, `apps/web/src/pages/manager/Reservations.tsx`
  - `apps/web/src/pages/driver/Reservations.tsx`, `apps/web/src/pages/driver/Profile.tsx`, `apps/web/src/pages/driver/MySession.tsx`, `apps/web/src/pages/driver/History.tsx`
  - `apps/web/src/components/ui/RecentSessionsCard.tsx`, `apps/web/src/components/evidence/EvidenceComparisonPanel.tsx`, `apps/web/src/components/driver/ReservationCheckInQr.tsx`

---

# Sprint 1 — PlateFormatter + Schema

## Task 1: PlateFormatter service (single source of truth)

**Files:**
- Create: `apps/api/src/plates/plate-formatter.ts`
- Create: `apps/api/src/plates/plate-formatter.spec.ts`
- Create: `apps/api/src/plates/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2–9):
  - `type PlateKind = 'car' | 'motorbike' | null`
  - `type PlateFormatStatus = 'OK' | 'PARTIAL' | 'INVALID'`
  - `interface PlateFormatResult { rawPlate: string; canonicalPlate: string | null; displayPlate: string | null; kind: PlateKind; status: PlateFormatStatus }`
  - `const PlateFormatter: { normalize(raw: string | null | undefined): string; toDisplay(canonical: string): string | null; parse(raw: string | null | undefined): PlateFormatResult; inferKind(canonical: string): PlateKind }`
  - Named exports: `normalize`, `toDisplay`, `parse`, `inferKind` (function forms), types.

- [ ] **Step 1: Write the failing test**

`apps/api/src/plates/plate-formatter.spec.ts`:

```typescript
import { PlateFormatter, inferKind, normalize, parse, toDisplay } from './plate-formatter';

describe('PlateFormatter.normalize', () => {
  it('uppercases and strips separators', () => {
    expect(normalize('30a-123.45')).toBe('30A12345');
    expect(normalize(' 59X3 456.78 ')).toBe('59X345678');
    expect(normalize('59-X1 234.56')).toBe('59X123456');
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });

  it('matches the exact behavior of the legacy normalizePlateNumber', () => {
    expect(normalize('90b2-452.30')).toBe('90B245230');
    expect(normalize('29K6-447.43')).toBe('29K644743');
  });
});

describe('PlateFormatter.toDisplay', () => {
  it('formats car plates (8 chars: XXA-123.45)', () => {
    expect(toDisplay('30A12345')).toBe('30A-123.45');
    expect(toDisplay('51K99999')).toBe('51K-999.99');
  });

  it('formats motorbike plates (9 chars: XXLd-456.78)', () => {
    expect(toDisplay('59X345678')).toBe('59X3-456.78');
    expect(toDisplay('29K644743')).toBe('29K6-447.43');
  });

  it('returns null for non-standard patterns', () => {
    expect(toDisplay('ABC')).toBeNull();
    expect(toDisplay('30A1234567')).toBeNull();
    expect(toDisplay('29A1234')).toBeNull(); // old 4-digit car plate: PARTIAL, no display
    expect(toDisplay('')).toBeNull();
  });
});

describe('PlateFormatter.inferKind', () => {
  it('infers car vs motorbike from pattern only', () => {
    expect(inferKind('30A12345')).toBe('car');
    expect(inferKind('59X345678')).toBe('motorbike');
    expect(inferKind('ABC')).toBeNull();
    expect(inferKind('')).toBeNull();
  });
});

describe('PlateFormatter.parse', () => {
  it('produces raw/canonical/display for a full read', () => {
    expect(parse('30a12345')).toEqual({
      rawPlate: '30a12345',
      canonicalPlate: '30A12345',
      displayPlate: '30A-123.45',
      kind: 'car',
      status: 'OK',
    });
  });

  it('marks partial reads with no display', () => {
    expect(parse('30A12?45')).toEqual({
      rawPlate: '30A12?45',
      canonicalPlate: '30A1245',
      displayPlate: null,
      kind: null,
      status: 'PARTIAL',
    });
  });

  it('marks empty input as INVALID', () => {
    expect(parse('')).toEqual({
      rawPlate: '',
      canonicalPlate: null,
      displayPlate: null,
      kind: null,
      status: 'INVALID',
    });
  });

  it('object form matches named exports', () => {
    expect(PlateFormatter.normalize).toBe(normalize);
    expect(PlateFormatter.toDisplay).toBe(toDisplay);
    expect(PlateFormatter.parse).toBe(parse);
    expect(PlateFormatter.inferKind).toBe(inferKind);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (workdir `apps/api`): `npx jest --testPathPattern "plates/plate-formatter" 2>&1`
Expected: FAIL — `Cannot find module './plate-formatter'`

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/plates/plate-formatter.ts`:

```typescript
export type PlateKind = 'car' | 'motorbike' | null;
export type PlateFormatStatus = 'OK' | 'PARTIAL' | 'INVALID';

export interface PlateFormatResult {
  rawPlate: string;
  canonicalPlate: string | null;
  displayPlate: string | null;
  kind: PlateKind;
  status: PlateFormatStatus;
}

const CAR_PATTERN = /^\d{2}[A-Z]\d{5}$/;
const MOTORCYCLE_PATTERN = /^\d{2}[A-Z]\d\d{5}$/;

export function normalize(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function toDisplay(canonical: string): string | null {
  if (CAR_PATTERN.test(canonical)) {
    return `${canonical.slice(0, 3)}-${canonical.slice(3, 6)}.${canonical.slice(6)}`;
  }
  if (MOTORCYCLE_PATTERN.test(canonical)) {
    return `${canonical.slice(0, 4)}-${canonical.slice(4, 7)}.${canonical.slice(7)}`;
  }
  return null;
}

export function inferKind(canonical: string): PlateKind {
  if (!canonical) return null;
  if (MOTORCYCLE_PATTERN.test(canonical)) return 'motorbike';
  if (CAR_PATTERN.test(canonical)) return 'car';
  return null;
}

export function parse(raw: string | null | undefined): PlateFormatResult {
  const rawPlate = raw ?? '';
  const canonicalPlate = normalize(rawPlate);
  const displayPlate = canonicalPlate ? toDisplay(canonicalPlate) : null;
  return {
    rawPlate,
    canonicalPlate: canonicalPlate || null,
    displayPlate,
    kind: displayPlate ? inferKind(canonicalPlate) : null,
    status: displayPlate ? 'OK' : canonicalPlate ? 'PARTIAL' : 'INVALID',
  };
}

export const PlateFormatter = { normalize, toDisplay, parse, inferKind };
```

`apps/api/src/plates/index.ts`:

```typescript
export { PlateFormatter, normalize, toDisplay, parse, inferKind } from './plate-formatter';
export type { PlateFormatResult, PlateFormatStatus, PlateKind } from './plate-formatter';
```

- [ ] **Step 4: Run test to verify it passes**

Run (workdir `apps/api`): `npx jest --testPathPattern "plates/plate-formatter" 2>&1`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plates
git commit -m "feat(plates): add PlateFormatter (normalize/toDisplay/parse) as single source of truth"
```

---

## Task 2: Schema migration (Vehicle, OcrEvidence, ParkingSession) + backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`
- Create: `apps/api/scripts/backfill-plate-display.mjs`

**Interfaces:**
- Consumes: plate pattern logic (re-implemented inline in the .mjs script — Node script cannot import TS; keep the two regexes identical to `plate-formatter.ts`).
- Produces (used by Tasks 3–8):
  - `Vehicle.plateDisplay String? @map("plate_display")` — canonical stays `plateNumber @unique` (Constraint 3)
  - `ParkingSession.plateDisplay String? @map("plate_display")` — canonical snapshot stays `plateNumberConfirmed`
  - `OcrEvidence.rawPlate String? @map("raw_plate")`, `OcrEvidence.canonicalPlate String? @map("canonical_plate")`, `OcrEvidence.displayPlate String? @map("display_plate")`

- [ ] **Step 1: Edit schema**

In `apps/api/prisma/schema.prisma`:

`model Vehicle` (line ~161), after `plateNumber`:

```prisma
  plateNumber  String      @unique @map("plate_number")
  plateDisplay String?     @map("plate_display")
```

`model ParkingSession` (line ~280), after `licensePlate`:

```prisma
  licensePlate          String        @map("license_plate")
  plateDisplay          String?       @map("plate_display")
```

`model OcrEvidence` (line ~507), after `ocrPlate`:

```prisma
  ocrPlate           String?      @map("ocr_plate")
  rawPlate           String?      @map("raw_plate")
  canonicalPlate     String?      @map("canonical_plate")
  displayPlate       String?      @map("display_plate")
```

- [ ] **Step 2: Generate migration**

Pre-req: stop any running API dev server (it locks the Prisma query engine DLL on Windows — this blocked a previous `prisma generate`; the server was node PID 25144. Kill via Task Manager if needed).

Run (workdir `apps/api`): `npx prisma migrate dev --name add_plate_normalization_fields 2>&1`
Expected: output shows migration `add_plate_normalization_fields` applied and Prisma Client regenerated.

- [ ] **Step 3: Create backfill script**

`apps/api/scripts/backfill-plate-display.mjs`:

```javascript
/**
 * One-off backfill for the new plate normalization columns:
 *   vehicles.plate_display         <- toDisplay(plate_number)
 *   parking_sessions.plate_display <- toDisplay(license_plate)
 *   ocr_evidences.{raw,canonical,display}_plate <- derived from rawResponse/ocr_plate
 * Run: node scripts/backfill-plate-display.mjs   (from apps/api)
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CAR = /^\d{2}[A-Z]\d{5}$/;
const MOTOR = /^\d{2}[A-Z]\d\d{5}$/;

function toCanonical(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function toDisplay(canonical) {
  if (CAR.test(canonical)) return `${canonical.slice(0, 3)}-${canonical.slice(3, 6)}.${canonical.slice(6)}`;
  if (MOTOR.test(canonical)) return `${canonical.slice(0, 4)}-${canonical.slice(4, 7)}.${canonical.slice(7)}`;
  return null;
}

async function main() {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true } });
  for (const v of vehicles) {
    const display = toDisplay(toCanonical(v.plateNumber));
    if (display && display !== v.plateNumber) {
      await prisma.vehicle.update({ where: { id: v.id }, data: { plateDisplay: display } });
    }
  }
  console.log(`vehicles backfilled: ${vehicles.length}`);

  const sessions = await prisma.parkingSession.findMany({ select: { id: true, licensePlate: true } });
  for (const s of sessions) {
    const display = toDisplay(toCanonical(s.licensePlate));
    if (display) {
      await prisma.parkingSession.update({ where: { id: s.id }, data: { plateDisplay: display } });
    }
  }
  console.log(`parking_sessions backfilled: ${sessions.length}`);

  const evidences = await prisma.ocrEvidence.findMany({ select: { id: true, ocrPlate: true, rawResponse: true } });
  for (const e of evidences) {
    const fromResponse = e.rawResponse?.results?.[0]?.plate ?? null;
    const raw = typeof fromResponse === 'string' ? fromResponse : e.ocrPlate;
    const canonical = toCanonical(raw);
    const display = toDisplay(canonical);
    await prisma.ocrEvidence.update({
      where: { id: e.id },
      data: {
        rawPlate: raw || null,
        canonicalPlate: canonical || null,
        displayPlate: display,
      },
    });
  }
  console.log(`ocr_evidences backfilled: ${evidences.length}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Run backfill**

Run (workdir `apps/api`): `node scripts/backfill-plate-display.mjs 2>&1`
Expected: three "backfilled: N" lines with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/scripts/backfill-plate-display.mjs
git commit -m "feat(db): add plate normalization columns + backfill script"
```

---

# Sprint 2 — API Contract, Reservation Lookup, FE Cleanup

## Task 3: API contract — OCR pipeline (PlateScanResult + OcrService)

**Files:**
- Modify: `apps/api/src/plate-recognition/plate-recognition.service.ts`
- Modify: `apps/api/src/plate-recognition/plate-recognition.service.spec.ts`
- Modify: `apps/api/src/ocr/ocr.types.ts`
- Modify: `apps/api/src/ocr/ocr.service.ts`
- Modify: `apps/api/src/ocr/ocr.service.spec.ts`

**Interfaces:**
- Consumes: `PlateFormatter.normalize` / `toDisplay` from `../plates` (Task 1), new Prisma columns (Task 2).
- Produces:
  - `PlateScanResult` gains `canonicalPlate: string | null`, `displayPlate: string | null` (`plate` and `rawPlate` unchanged — backward compat)
  - `OcrRecognizeResponse` gains `rawPlate`, `canonicalPlate`, `displayPlate` (all `string | null`)
  - Evidence records persist the three new columns (audit history)

- [ ] **Step 1: Update the failing test**

Append to `apps/api/src/plate-recognition/plate-recognition.service.spec.ts`:

```typescript
describe('PlateScanResult canonical/display fields', () => {
  const service = new (require('./plate-recognition.service').PlateRecognitionService)({
    get: () => 'token',
  } as any);

  it('recognize() returns canonicalPlate and displayPlate alongside existing fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          processing_time: 100,
          results: [
            {
              plate: '30a12345',
              score: 0.99,
              dscore: 0.9,
              region: { code: 'vn' },
              vehicle: { type: 'Sedan' },
              box: { xmin: 0, ymin: 0, xmax: 100, ymax: 50 },
              candidates: [{ plate: '30a12345', score: 0.99 }],
            },
          ],
        }),
    } as any);

    const result = await service.recognize(Buffer.from('x'), 'image/jpeg');
    expect(result.plate).toBe('30A-12345'); // legacy format unchanged
    expect(result.rawPlate).toBe('30a12345');
    expect(result.canonicalPlate).toBe('30A12345');
    expect(result.displayPlate).toBe('30A-123.45');
    expect(result.vehicleType).toBe('Sedan');
    (global.fetch as any).mockRestore();
  });

  it('recognize() returns null canonical/display when nothing detected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ processing_time: 0, results: [] }),
    } as any);

    const result = await service.recognize(Buffer.from('x'), 'image/jpeg');
    expect(result.plate).toBeNull();
    expect(result.canonicalPlate).toBeNull();
    expect(result.displayPlate).toBeNull();
    (global.fetch as any).mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (workdir `apps/api`): `npx jest --testPathPattern "plate-recognition" 2>&1`
Expected: FAIL — `canonicalPlate is undefined`

- [ ] **Step 3: Implement PlateRecognitionService**

In `apps/api/src/plate-recognition/plate-recognition.service.ts`:

Add to `PlateScanResult` interface:

```typescript
export interface PlateScanResult {
  plate: string | null;
  rawPlate: string | null;
  canonicalPlate: string | null;
  displayPlate: string | null;
  score: number;
  dscore: number;
  region: string | null;
  candidates: PlateScanCandidate[];
  vehicleType: string | null;
  processingTime: number;
  providerFilename?: string | null;
  providerTimestamp?: string | null;
  plateBox?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  rawResponse?: unknown;
}
```

Add import:

```typescript
import { normalize, toDisplay } from '../plates';
```

In the "no results" early return (currently ~line 134), replace the return object with (keep every existing field, add the two new ones):

```typescript
    if (results.length === 0) {
      return {
        plate: null,
        rawPlate: null,
        canonicalPlate: null,
        displayPlate: null,
        score: 0,
        dscore: 0,
        region: null,
        candidates: [],
        vehicleType: null,
        processingTime: data?.processing_time ?? 0,
        providerFilename: data?.filename ?? null,
        providerTimestamp: data?.timestamp ?? null,
        plateBox: null,
        rawResponse: data,
      };
    }
```

In the final return (currently ~line 163), replace with:

```typescript
    const canonicalPlate = rawPlate ? normalize(rawPlate) : null;
    const displayPlate = canonicalPlate ? toDisplay(canonicalPlate) : null;

    return {
      plate: rawPlate ? formatVietnamesePlate(rawPlate) : null,
      rawPlate,
      canonicalPlate,
      displayPlate,
      score: top?.score ?? 0,
      dscore: top?.dscore ?? 0,
      region: top?.region?.code ?? null,
      candidates,
      vehicleType: top?.vehicle?.type ?? null,
      processingTime: data?.processing_time ?? 0,
      providerFilename: data?.filename ?? null,
      providerTimestamp: data?.timestamp ?? null,
      plateBox: top?.box
        ? {
            xmin: top.box.xmin,
            ymin: top.box.ymin,
            xmax: top.box.xmax,
            ymax: top.box.ymax,
          }
        : null,
      rawResponse: data,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run (workdir `apps/api`): `npx jest --testPathPattern "plate-recognition" 2>&1`
Expected: PASS — all tests green (existing `formatVietnamesePlate` tests + new field tests).

- [ ] **Step 5: Update OcrService types + service**

In `apps/api/src/ocr/ocr.types.ts`, extend `OcrRecognizeResponse` (after `detectedPlate`):

```typescript
  detectedPlate: string | null;
  rawPlate: string | null;
  canonicalPlate: string | null;
  displayPlate: string | null;
```

In `apps/api/src/ocr/ocr.service.ts`:

(a) In the success-path `createEvidenceRecord` call, add after `ocrPlate: scan.plate,`:

```typescript
        rawPlate: scan.rawPlate ?? null,
        canonicalPlate: scan.canonicalPlate ?? null,
        displayPlate: scan.displayPlate ?? null,
```

(b) In the error-path `createEvidenceRecord` call, add after `ocrPlate: null,`:

```typescript
        rawPlate: null,
        canonicalPlate: null,
        displayPlate: null,
```

(c) In `toResponse`, add after `detectedPlate: evidence.ocrPlate,`:

```typescript
      rawPlate: evidence.rawPlate ?? null,
      canonicalPlate: evidence.canonicalPlate ?? null,
      displayPlate: evidence.displayPlate ?? null,
```

(d) Extend the `EvidenceRecord` type (top of file) with:

```typescript
  rawPlate?: string | null;
  canonicalPlate?: string | null;
  displayPlate?: string | null;
```

- [ ] **Step 6: Update ocr.service.spec.ts**

In `apps/api/src/ocr/ocr.service.spec.ts`, find where the mocked `plateRecognitionService.recognize` resolves a `scan` object with `{ detectedPlate: '51A-12345', ... }` and add to that mock:

```typescript
      canonicalPlate: '51A12345',
      displayPlate: '51A-123.45',
      rawPlate: '51a12345',
```

Then in the `it` block asserting the response, add:

```typescript
    expect(result.canonicalPlate).toBe('51A12345');
    expect(result.displayPlate).toBe('51A-123.45');
    expect(result.rawPlate).toBe('51a12345');
```

(Adjust values to match whatever the spec's existing mock uses — the important part is the three new fields flow through `toResponse`.)

- [ ] **Step 7: Run tests**

Run (workdir `apps/api`): `npx jest --testPathPattern "ocr.service|plate-recognition" 2>&1`
Expected: PASS.

- [ ] **Step 8: Type-check**

Run (workdir `apps/api`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/plate-recognition apps/api/src/ocr
git commit -m "feat(ocr): expose raw/canonical/display plate in scan results and evidence records"
```

---

## Task 4: API contract — Vehicles, Gate, Registrations

**Files:**
- Modify: `apps/api/src/vehicles/vehicles.service.ts`
- Modify: `apps/api/src/gate/gate.service.ts`
- Modify: `apps/api/src/gate/gate.service.spec.ts`
- Modify: `apps/api/src/vehicle-registrations/vehicle-registrations.service.ts`

**Interfaces:**
- Consumes: `PlateFormatter` from `../plates` (Task 1), new Prisma columns (Task 2).
- Produces:
  - `normalizePlateNumber` (still exported from `vehicles.service.ts`) delegates to `PlateFormatter.normalize` — single canonical implementation, all existing imports unchanged
  - `MatchedVehicleSummary.vehicle.plateDisplay`, `LookupPlateResult.vehicle.plateDisplay`, `findMyVehicles` items gain `plateDisplay`
  - `GateScanResponse` CHECK_IN and CHECK_OUT variants gain `plateDisplay: string | null`
  - `Vehicle.plateDisplay` persisted on registration approval

- [ ] **Step 1: Single-source the canonicalizer**

In `apps/api/src/vehicles/vehicles.service.ts`:

(a) Add import at top:

```typescript
import { PlateFormatter } from '../plates';
```

(b) Replace the `normalizePlateNumber` implementation at line 439:

```typescript
export function normalizePlateNumber(value: string | null | undefined): string {
  return PlateFormatter.normalize(value);
}
```

- [ ] **Step 2: Expose plateDisplay in vehicle responses**

In `apps/api/src/vehicles/vehicles.service.ts`:

(a) `MatchedVehicleSummary.vehicle` type (line ~15) — add after `plateNumber: string;`:

```typescript
    plateDisplay: string | null;
```

(b) `findMyVehicles` mapping (line ~133) — add after `plateNumber: vehicle.plateNumber,`:

```typescript
      plateDisplay: vehicle.plateDisplay ?? null,
```

(c) `matchPlate` vehicle mapping (line ~253) — add after `plateNumber: vehicle.plateNumber,`:

```typescript
        plateDisplay: vehicle.plateDisplay ?? null,
```

(d) `lookupPlate` vehicle mapping (line ~402) — add after `plateNumber: vehicle.plateNumber,`:

```typescript
        plateDisplay: vehicle.plateDisplay ?? null,
```

- [ ] **Step 3: Persist plateDisplay on registration approval**

In `apps/api/src/vehicle-registrations/vehicle-registrations.service.ts`:

(a) Add import:

```typescript
import { PlateFormatter } from '../plates';
```

(b) In `reviewRequest`, the `tx.vehicle.create` (line ~193) — replace with:

```typescript
          vehicle = await tx.vehicle.create({
            data: {
              plateNumber: request.plateNumber,
              plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)),
              vehicleType: request.vehicleType,
              isActive: true,
            },
          });
```

(c) When the vehicle already exists (findFirst branch), also backfill display if missing:

```typescript
        let vehicle = await tx.vehicle.findFirst({
          where: { plateNumber: request.plateNumber },
        });

        if (vehicle && !vehicle.plateDisplay) {
          vehicle = await tx.vehicle.update({
            where: { id: vehicle.id },
            data: { plateDisplay: PlateFormatter.toDisplay(PlateFormatter.normalize(request.plateNumber)) },
          });
        }
```

Note: `request.plateNumber` is DTO-validated to canonical form (see Global Constraints / existing `@Matches` DTOs).

- [ ] **Step 4: Gate response gains plateDisplay**

In `apps/api/src/gate/gate.service.ts`:

(a) Add import:

```typescript
import { toDisplay } from '../plates';
```

(b) Extend `GateScanResponse` — add `plateDisplay: string | null;` after `plateConfirmed: string;` in BOTH the CHECK_IN variant and the CHECK_OUT variant.

(c) In `resolvePlateMode`, after `const plateConfirmed = normalizePlateNumber(input.plate);` (line 100), add:

```typescript
    const plateDisplay = toDisplay(plateConfirmed);
```

(d) Add `plateDisplay,` to the CHECK_OUT return object (after `plateConfirmed,`, line 119) and to the CHECK_IN return object (after `plateConfirmed,`, line 136).

- [ ] **Step 5: Update gate spec**

In `apps/api/src/gate/gate.service.spec.ts`, find the test that resolves a plate and asserts `plateConfirmed`; add after the `plateConfirmed` assertion:

```typescript
      expect(result.plateDisplay).toBe('51A-123.45');
```

(If the test uses a different plate value, compute its display form with `toDisplay` semantics: car `XXA12345` → `XXA-123.45`, motorbike `XXLd45678` → `XXLd-456.78`.)

- [ ] **Step 6: Run tests**

Run (workdir `apps/api`): `npx jest --testPathPattern "gate.service" 2>&1`
Expected: PASS — gate 5/5 + new assertion.

- [ ] **Step 7: Type-check**

Run (workdir `apps/api`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output. NOTE: `vehicles.service.spec.ts` fails to compile for a PRE-EXISTING reason (`linkUser` missing) — that suite was already broken before this plan; do not fix it here.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/vehicles apps/api/src/gate apps/api/src/vehicle-registrations
git commit -m "feat(api): expose plateDisplay in vehicle/gate contracts, single-source canonicalizer"
```

---

## Task 5: Reservation lookup — canonical only

**Files:**
- Modify: `apps/api/src/reservations/reservations.service.ts`
- Modify: `apps/api/src/reservations/reservations.service.spec.ts`

**Interfaces:**
- Consumes: `normalizePlateNumber` from `../vehicles/vehicles.service` (already canonical — Task 4 keeps it delegated to `PlateFormatter.normalize`).
- Produces:
  - `ReservationsService.findActiveByCanonicalPlate(canonicalPlate: string)` → active reservation with `slot { include: floor }` + `vehicle`, or null
  - Audit rule (documented): every plate-keyed reservation/vehicle/session query uses canonical; never search by display.

**Rationale:** Today PBMS resolves reservations by `reservationId`/QR or `driverId` — there is no plate-keyed reservation search (verified: `sessions.service.ts:222-249`). The canonical contract must exist before any future plate-driven lookup (Smart Check-out, Step 8). This task locks the rule and adds the helper with tests. No behavior change to existing flows.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/reservations/reservations.service.spec.ts` (adjust to the spec file's existing mock style for `prisma.reservation.findFirst`):

```typescript
describe('findActiveByCanonicalPlate', () => {
  const makeReservation = () => ({
    id: 'res-uuid',
    driverId: 'driver-uuid',
    slotId: 1,
    vehicleId: 'vehicle-uuid',
    vehicleType: 'CAR',
    status: 'active',
    expiresAt: new Date(),
    slot: { id: 1, code: 'A1', floor: { id: 1, name: 'Floor 1', floorNumber: 1 } },
    vehicle: { id: 'vehicle-uuid', plateNumber: '59A12345', vehicleType: 'CAR' },
  });

  it('finds an active reservation by canonical plate via vehicle join', async () => {
    (service as any).prisma.reservation.findFirst.mockResolvedValue(makeReservation());
    const result = await service.findActiveByCanonicalPlate('59A12345');
    expect(result?.id).toBe('res-uuid');
    expect((service as any).prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'active', vehicle: { plateNumber: '59A12345' } },
      }),
    );
  });

  it('returns null when no active reservation matches', async () => {
    (service as any).prisma.reservation.findFirst.mockResolvedValue(null);
    const result = await service.findActiveByCanonicalPlate('59A12345');
    expect(result).toBeNull();
  });

  it('rejects empty input', async () => {
    await expect(service.findActiveByCanonicalPlate('')).rejects.toThrow('canonicalPlate is required');
  });
});
```

(If the spec file constructs the service differently, use `service` as instantiated there — the `prisma.reservation.findFirst` mock is what matters.)

- [ ] **Step 2: Run test to verify it fails**

Run (workdir `apps/api`): `npx jest --testPathPattern "reservations.service" 2>&1`
Expected: FAIL — `service.findActiveByCanonicalPlate is not a function`

- [ ] **Step 3: Implement**

In `apps/api/src/reservations/reservations.service.ts` (add import if not present):

```typescript
import { normalizePlateNumber } from '../vehicles/vehicles.service';
```

Add method (place near the other lookup methods, e.g. after `findActiveByDriver` if it exists; otherwise after the constructor):

```typescript
  /**
   * Finds an active reservation whose linked vehicle matches the canonical plate.
   * ALWAYS search by canonical — never by display.
   */
  async findActiveByCanonicalPlate(canonicalPlate: string) {
    if (!canonicalPlate) {
      throw new BadRequestException('canonicalPlate is required');
    }
    const normalized = normalizePlateNumber(canonicalPlate);
    return this.prisma.reservation.findFirst({
      where: {
        status: 'active',
        vehicle: { plateNumber: normalized },
      },
      include: {
        slot: { include: { floor: true } },
        vehicle: true,
      },
    });
  }
```

(Ensure `BadRequestException` is imported from `@nestjs/common` — check the existing imports; if the file already imports it, reuse.)

- [ ] **Step 4: Run test to verify it passes**

Run (workdir `apps/api`): `npx jest --testPathPattern "reservations.service" 2>&1`
Expected: PASS — existing suites + 3 new tests. (If the suite has pre-existing failures unrelated to this task, only the 3 new tests must pass; report any pre-existing failures as not-ours.)

- [ ] **Step 5: Audit rule — verify no display-keyed queries exist**

Run (workdir `apps/api`):

```powershell
Select-String -Path src -Pattern "where: \{\s*plateNumber: plateDisplay|plateDisplay:" -Recurse
```

Also manually confirm the plate-keyed query points all normalize before use (already verified, documented above):
- `sessions.lookupOpenForGateByPlate` → `normalizePlateNumber` at `sessions.service.ts:1613` ✅
- `vehicles.matchPlate` / `lookupPlate` → `normalizePlateNumber` at `vehicles.service.ts:154/301` ✅
- check-in `matchedVehicle` → `normalizePlateNumber` at `sessions.service.ts:151` ✅
- `findActiveByCanonicalPlate` → `normalizePlateNumber` inside method ✅

Expected: zero matches for display-keyed queries.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/reservations
git commit -m "feat(reservations): add findActiveByCanonicalPlate — canonical-only lookup contract"
```

---

## Task 6: FE — API types + staff gate panels

**Files:**
- Modify: `apps/web/src/lib/sessions-api.ts`
- Modify: `apps/web/src/lib/plate-recognition-api.ts`
- Modify: `apps/web/src/pages/staff/StaffOcrCheckInPanel.tsx`
- Modify: `apps/web/src/pages/staff/Gate.tsx`
- Modify: `apps/web/src/pages/staff/StaffReservationQrCheckInPanel.tsx`

**Interfaces:**
- Consumes: Task 3/4 API responses.
- Produces (used by Task 7):
  - `OcrRecognizeResponse` gains `rawPlate`, `canonicalPlate`, `displayPlate`
  - `GateScanResponse` variants gain `plateDisplay: string | null`
  - Session/vehicle summary types gain `plateDisplay: string | null | undefined`
  - `PlateScanResult` (plate-recognition-api.ts) gains `canonicalPlate`, `displayPlate`
  - Staff panels render backend display fields, no FE formatting

- [ ] **Step 1: Edit `apps/web/src/lib/sessions-api.ts`**

Extend `OcrRecognizeResponse` (line ~109) — after `detectedPlate`:

```typescript
  detectedPlate: string | null
  rawPlate: string | null
  canonicalPlate: string | null
  displayPlate: string | null
```

Add to `VehicleLookupResponse.vehicle` (line ~142) — after `plateNumber`:

```typescript
    plateNumber: string
    plateDisplay: string | null
```

Find the `GateScanResponse` type (search for `plateConfirmed` in this file) and add `plateDisplay: string | null` to both `CHECK_IN` and `CHECK_OUT` variants (after `plateConfirmed`).

Find session summary interfaces (search for `licensePlate` in interface definitions) and add `plateDisplay?: string | null` beside `licensePlate` (additive optional — keeps compatibility with any endpoint that doesn't return it yet).

- [ ] **Step 2: Edit `apps/web/src/lib/plate-recognition-api.ts`**

Extend `PlateScanResult` (line ~8) — after `rawPlate`:

```typescript
  /** Canonical plate (uppercase, no separators), e.g. "30A12345". */
  canonicalPlate: string | null
  /** Display plate per VN standard, e.g. "30A-123.45". */
  displayPlate: string | null
```

- [ ] **Step 3: StaffOcrCheckInPanel.tsx**

Replace the manual `nextOcrResult` construction (currently uses `formatPlateForDisplay(...)`):

```typescript
      const nextOcrResult: OcrRecognizeResponse = {
        ocrEvidenceId: response.ocrEvidenceId ?? '',
        detectedPlate:
          response.mode === 'NEEDS_MANUAL_PLATE'
            ? null
            : response.plateDisplay ?? response.plateConfirmed,
        rawPlate: null,
        canonicalPlate: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.plateConfirmed,
        displayPlate: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.plateDisplay,
        confidence: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.confidence ?? null,
        vehicleTypePrediction: null,
        ...
```

Replace the other `formatPlateForDisplay(...)` usages in this file (plate display of `response.plateConfirmed` in toast/route calls, ~lines 448/455/466) with `response.plateDisplay ?? response.plateConfirmed` (fall back to canonical when display is null — never format client-side).

Replace the two display render sites (`formatPlateForDisplay(licensePlate)` at ~870 and `formatPlateForDisplay(ticket.licensePlate)` at ~745/998) with `licensePlate` / `ticket.plateDisplay ?? ticket.licensePlate` respectively.

Remove the `formatPlateForDisplay` import; keep `normalizePlateForApi` + `isValidVietnamesePlate` imports.

- [ ] **Step 4: Gate.tsx**

Replace every `formatPlateForDisplay(...)` call in `apps/web/src/pages/staff/Gate.tsx` with the backend-provided value:
- `formatPlateForDisplay(checkInPlateNormalized)` (line ~1007) → `workflow.session.plateDisplay ?? checkInPlateNormalized`
- `formatPlateForDisplay(checkOutPlateNormalized)` (line ~1012) → `checkoutSession.plateDisplay ?? checkOutPlateNormalized` (use whichever session object the file has in scope for the checkout workflow)
- `formatPlateForDisplay(evidence.ocrPlate)` → `evidence.displayPlate ?? evidence.canonicalPlate ?? evidence.ocrPlate`
- `formatPlateForDisplay(workflow.session.licensePlate)` (line ~996) → `workflow.session.plateDisplay ?? workflow.session.licensePlate`

Remove the `formatPlateForDisplay` import; keep `normalizePlateForApi` + `formatVehicleType` imports.

- [ ] **Step 5: StaffReservationQrCheckInPanel.tsx**

Replace:

```typescript
<Metric label="Plate" value={formatPlateForDisplay(confirmData.session.licensePlate)} mono strong />
```

with:

```typescript
<Metric label="Plate" value={confirmData.session.plateDisplay ?? confirmData.session.licensePlate} mono strong />
```

and the `scanData.plateNumber` site similarly (`scanData.plateDisplay ?? scanData.plateNumber`). Remove the `formatPlateForDisplay` import.

- [ ] **Step 6: Type-check**

Run (workdir `apps/web`): `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String -Pattern "StaffOcrCheckInPanel|Gate.tsx|StaffReservationQrCheckInPanel"`
Expected: no output (or only errors in files not yet migrated — resolved in Task 7).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/sessions-api.ts apps/web/src/lib/plate-recognition-api.ts apps/web/src/pages/staff
git commit -m "feat(web): staff gate panels render backend display plate"
```

---

## Task 7: FE cleanup — remaining sites, delete formatPlateForDisplay

**Files (all modify):**
- `apps/web/src/pages/admin/AdminSessions.tsx`
- `apps/web/src/pages/admin/AdminReportsFlags.tsx`
- `apps/web/src/pages/manager/Vehicles.tsx`
- `apps/web/src/pages/manager/Reservations.tsx`
- `apps/web/src/pages/driver/Reservations.tsx`
- `apps/web/src/pages/driver/Profile.tsx`
- `apps/web/src/pages/driver/MySession.tsx`
- `apps/web/src/pages/driver/History.tsx`
- `apps/web/src/components/ui/RecentSessionsCard.tsx`
- `apps/web/src/components/evidence/EvidenceComparisonPanel.tsx`
- `apps/web/src/components/driver/ReservationCheckInQr.tsx`
- `apps/web/src/lib/plate-format.ts`
- `apps/web/src/lib/plate-format.spec.ts`

**Interfaces:**
- Consumes: `plateDisplay`/`displayPlate` fields on backend responses (Tasks 3–4).

- [ ] **Step 1: Delete the formatter, keep sanitize + validate**

In `apps/web/src/lib/plate-format.ts`, delete the `formatPlateForDisplay` function entirely. KEEP:
- `normalizePlateForApi` (input sanitization at API boundary — strips separators, does NOT add dashes/dots)
- `isValidVietnamesePlate` (manual-entry UX validation)
- `formatVehicleType` (vehicle-type label mapping — NOT plate formatting)

Check with grep whether `CAR_PLATE_REGEX`/`MOTORCYCLE_PLATE_REGEX`/`VIETNAMESE_PLATE_REGEX` are exported and used elsewhere; `isValidVietnamesePlate` uses `VIETNAMESE_PLATE_REGEX` internally so keep what's needed, remove only unused exports.

- [ ] **Step 2: Update plate-format.spec.ts**

Delete the `describe('formatPlateForDisplay', ...)` block. Keep `normalizePlateForApi` and `isValidVietnamesePlate` tests; remove the `pre-formatted input` / `normalized form for unrecognized patterns` cases that asserted formatter behavior.

- [ ] **Step 3: Replace call sites (mechanical, per file)**

Pattern: remove the `formatPlateForDisplay` import; replace each call with the backend display field for that data source:

| File | Old call | New expression |
|---|---|---|
| `AdminSessions.tsx:427` | `formatPlateForDisplay(item.licensePlate)` | `item.plateDisplay ?? item.licensePlate` |
| `AdminReportsFlags.tsx:320,428` | `formatPlateForDisplay(flag.plateNumber)` | `flag.plateDisplay ?? flag.plateNumber` |
| `manager/Vehicles.tsx:237,319,447,609` | `formatPlateForDisplay(req.plateNumber)` / `(vehicleData.vehicle.plateNumber)` | `req.plateDisplay ?? req.plateNumber` / `vehicleData.vehicle.plateDisplay ?? vehicleData.vehicle.plateNumber` |
| `manager/Reservations.tsx:337` | `formatPlateForDisplay(reservation.licensePlate)` | `reservation.plateDisplay ?? reservation.licensePlate` |
| `driver/Reservations.tsx:503,779,833,918,935,954,1029` | `formatPlateForDisplay(pendingReq.plateNumber)` etc. | `pendingReq.plateDisplay ?? pendingReq.plateNumber` (same pattern for `rejReq`, `vehicle.plateNumber`, `selectedVehicle`) |
| `driver/Profile.tsx:98,140` | `formatPlateForDisplay(v.plateNumber)` / `(r.plateNumber)` | `v.plateDisplay ?? v.plateNumber` / `r.plateDisplay ?? r.plateNumber` |
| `driver/MySession.tsx:143` | `formatPlateForDisplay(session.licensePlate)` | `session.plateDisplay ?? session.licensePlate` |
| `driver/History.tsx:95` | `formatPlateForDisplay(session.licensePlate)` | `session.plateDisplay ?? session.licensePlate` |
| `RecentSessionsCard.tsx:157` | `formatPlateForDisplay(session.licensePlate)` | `session.plateDisplay ?? session.licensePlate` |
| `EvidenceComparisonPanel.tsx:64` | `formatPlateForDisplay(evidence?.confirmedPlate ?? evidence?.ocrPlate)` | `evidence?.displayPlate ?? evidence?.confirmedPlate ?? evidence?.ocrPlate` |
| `ReservationCheckInQr.tsx:55` | `formatPlateForDisplay(rawPlate)` | `reservation.plateDisplay ?? rawPlate` (rawPlate = `reservation.licensePlate ?? vehicle?.plateNumber`) |

For TS errors caused by `plateDisplay` not existing on a type yet (e.g. `item.plateDisplay` on an admin session row, `req.plateDisplay` on a registration row), add the field to the corresponding interface in `apps/web/src/lib/sessions-api.ts` / `admin-api.ts` / `driver-api.ts` / `manager-reservations-api.ts` as optional (`plateDisplay?: string | null`).

- [ ] **Step 4: Run FE tests + type-check**

Run (workdir `apps/web`): `npx jest --config jest.config.cjs --rootDir . 2>&1`
Expected: PASS — updated plate-format tests.

Run (workdir `apps/web`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output.

- [ ] **Step 5: Grep guard — no formatting left in FE**

Run (workdir `apps/web`): `Select-String -Path src -Pattern "formatPlateForDisplay" -Recurse`
Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(web): remove FE plate formatting, render backend display plate everywhere"
```

---

# Sprint 3 — Session Snapshot + OCR History

## Task 8: ParkingSession display snapshot at check-in

**Files:**
- Modify: `apps/api/src/sessions/sessions.service.ts`

**Interfaces:**
- Consumes: `PlateFormatter.toDisplay` from `../plates` (Task 1), `ParkingSession.plateDisplay` column (Task 2).
- Produces: `ParkingSession.plateDisplay` written at check-in (`sessions.service.ts:704` area — `createParkingSession` data payload); session response mappers include `plateDisplay`.

**Rationale (why snapshot):** A session's plate must never be re-read live from `vehicle.plateNumber` — a vehicle can change plates later; historical sessions must still display the plate as captured at check-in. Canonical snapshot already exists (`plateNumberConfirmed`, set at `sessions.service.ts:151` from `normalizePlateNumber`); this task adds the display twin.

- [ ] **Step 1: Implement**

In `apps/api/src/sessions/sessions.service.ts`:

(a) Add import:

```typescript
import { PlateFormatter } from '../plates';
```

(b) In `checkIn()`, after `const plateNumberConfirmed = normalizePlateNumber(licensePlate);` (line 151), add:

```typescript
    const plateDisplay = PlateFormatter.toDisplay(plateNumberConfirmed);
```

(c) Find the `createParkingSession` data payload where `plateNumberConfirmed: input.plateConfirmed` is set (line ~704), and add next to it:

```typescript
        plateDisplay: input.plateDisplay ?? null,
```

(d) In the `createParkingSession` signature/type (search for `plateConfirmed` in its parameter type, ~line 305 area), add:

```typescript
        plateDisplay?: string | null;
```

(e) In the `checkIn()` call to `createParkingSession(tx, {...})` (~line 299), add to the passed object:

```typescript
          plateDisplay,
```

(f) In the check-in response summary (the object that maps `licensePlate: session.licensePlate`, ~line 360), add after it:

```typescript
        plateDisplay: session.plateDisplay ?? null,
```

(g) In the other session-summary mappers the FE renders (search `licensePlate:` in `mapReservationSessionSummary` and `buildCheckoutLookupPreview`), add `plateDisplay: session.plateDisplay ?? null` next to each `licensePlate` field.

- [ ] **Step 2: Type-check**

Run (workdir `apps/api`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output.

- [ ] **Step 3: Run sessions tests**

Run (workdir `apps/api`): `npx jest --testPathPattern "sessions.service" 2>&1`
Expected: PASS if the suite was passing before this change; if it was already failing for pre-existing DI reasons, note and move on — `gate.service.spec` + `plate-recognition` + `ocr.service` are the required green suites for this plan.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/sessions
git commit -m "feat(sessions): snapshot plateDisplay at check-in and expose in session responses"
```

---

## Task 9: OCR history — evidence responses expose raw/canonical/display

**Files:**
- Modify: `apps/api/src/ocr-evidences/ocr-evidences.service.ts`

**Interfaces:**
- Consumes: new `OcrEvidence` columns (Task 2).
- Produces: evidence detail responses include `rawPlate`, `canonicalPlate`, `displayPlate` (audit/debug surface for AI output).

- [ ] **Step 1: Implement**

In `apps/api/src/ocr-evidences/ocr-evidences.service.ts`, in the response mapping (find where `ocrPlate` / `confirmedPlate` are returned), add:

```typescript
        rawPlate: evidence.rawPlate ?? null,
        canonicalPlate: evidence.canonicalPlate ?? null,
        displayPlate: evidence.displayPlate ?? null,
```

(If the service returns raw `evidence` rows via `findMany`/`findUnique` without explicit mapping, extend the `select` objects to include `rawPlate: true, canonicalPlate: true, displayPlate: true` so consumers receive them.)

- [ ] **Step 2: Type-check**

Run (workdir `apps/api`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/ocr-evidences
git commit -m "feat(ocr-evidences): expose raw/canonical/display plate in evidence history"
```

---

# Sprint 4 — Future Foundation (OPTIONAL, DEFERRED)

## Task 10: Fuzzy matching engine (foundation for Smart Check-out / Vehicle Verification Engine)

**Files:**
- Create: `apps/api/src/plates/plate-match.ts`
- Create: `apps/api/src/plates/plate-match.spec.ts`
- Modify: `apps/api/src/plates/index.ts` (re-export)

**Interfaces:**
- Consumes: `PlateFormatter.normalize` (Task 1).
- Produces (NOT wired into any flow yet — Smart Check-out integration is a separate future plan):
  - `interface PlateMatch { rawPlate: string; canonicalPlate: string; similarity: number }`
  - `function similarity(a: string, b: string): number` — normalized Levenshtein ratio (0..1)
  - `function matchPlate(rawPlate: string, knownCanonicals: string[], threshold = 0.8): PlateMatch | null` — best canonical match above threshold

**Scope note:** This is the foundation ONLY. Wire-in to checkout flows belongs to the future "Smart Check-out" plan. Implement this task only if Sprint 1–3 are complete and verified; otherwise mark it skipped and keep the design in this section.

- [ ] **Step 1: Write the failing test**

`apps/api/src/plates/plate-match.spec.ts`:

```typescript
import { matchPlate, similarity } from './plate-match';

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('43A27206', '43A27206')).toBe(1);
  });

  it('returns high similarity for OCR confusion pairs', () => {
    // classic OCR confusion: 6 vs 8
    expect(similarity('43A27206', '43A27208')).toBeGreaterThan(0.8);
    expect(similarity('43A27206', '43A27208')).toBeLessThan(1);
  });

  it('returns 0 for completely different plates', () => {
    expect(similarity('30A12345', '59X345678')).toBeLessThan(0.3);
  });

  it('normalizes both inputs before comparing', () => {
    expect(similarity('43a-272.06', '43A27206')).toBe(1);
  });
});

describe('matchPlate', () => {
  it('picks the best canonical match above threshold', () => {
    const result = matchPlate('43A27206', ['30A12345', '43A27208', '43A27206']);
    expect(result?.canonicalPlate).toBe('43A27206');
    expect(result?.similarity).toBe(1);
  });

  it('returns null below threshold', () => {
    const result = matchPlate('43A27206', ['59X345678'], 0.8);
    expect(result).toBeNull();
  });

  it('carries the raw plate through', () => {
    const result = matchPlate('43a-272.06', ['43A27206']);
    expect(result?.rawPlate).toBe('43a-272.06');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (workdir `apps/api`): `npx jest --testPathPattern "plates/plate-match" 2>&1`
Expected: FAIL — `Cannot find module './plate-match'`

- [ ] **Step 3: Implement**

`apps/api/src/plates/plate-match.ts`:

```typescript
import { normalize } from './plate-formatter';

export interface PlateMatch {
  rawPlate: string;
  canonicalPlate: string;
  similarity: number;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

export function matchPlate(
  rawPlate: string,
  knownCanonicals: string[],
  threshold = 0.8,
): PlateMatch | null {
  let best: PlateMatch | null = null;
  for (const candidate of knownCanonicals) {
    const score = similarity(rawPlate, candidate);
    if (!best || score > best.similarity) {
      best = { rawPlate, canonicalPlate: candidate, similarity: score };
    }
  }
  if (!best || best.similarity < threshold) return null;
  return best;
}
```

In `apps/api/src/plates/index.ts`, add:

```typescript
export { matchPlate, similarity } from './plate-match';
export type { PlateMatch } from './plate-match';
```

- [ ] **Step 4: Run test to verify it passes**

Run (workdir `apps/api`): `npx jest --testPathPattern "plates/plate-match" 2>&1`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plates
git commit -m "feat(plates): add fuzzy plate matching engine (foundation for Smart Check-out)"
```

---

## Task 11: Final verification gate

- [ ] **Step 1: Backend full test sweep (excluding known-broken suites)**

Run (workdir `apps/api`): `npx jest --testPathPattern "plates/plate-formatter|plates/plate-match|plate-recognition|ocr.service|gate.service" 2>&1`
Expected: all matching suites PASS.

- [ ] **Step 2: Backend full type-check**

Run (workdir `apps/api`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output (except the pre-existing `vehicles.service.spec.ts` compile error documented in Global Constraints).

- [ ] **Step 3: FE tests**

Run (workdir `apps/web`): `npx jest --config jest.config.cjs --rootDir . 2>&1`
Expected: PASS — all suites.

- [ ] **Step 4: FE type-check**

Run (workdir `apps/web`): `npx tsc --noEmit -p tsconfig.json 2>&1`
Expected: no output.

- [ ] **Step 5: Grep guards**

Run (workdir `apps/web`): `Select-String -Path src -Pattern "formatPlateForDisplay" -Recurse`
Expected: zero matches.

Run (workdir `apps/api`): `Select-String -Path src -Pattern "plateDisplay:.*toDisplay|toDisplay\(" -Recurse`
Expected: matches only inside `gate.service.ts`, `sessions.service.ts`, `vehicle-registrations.service.ts` (backend-only formatting; FE performs none).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: verify plate normalization architecture across backend and frontend"
```

---

## Self-Review Notes

- Step 0 conventions (raw/canonical/display) locked in Global Constraints; Canonical = search/matching/OCR/reservation (Constraint 7), Display = UI only (Constraint 5), Raw = audit (Task 9 + OcrEvidence columns). ✅
- Step 1 PlateFormatter service with exactly `normalize()` / `toDisplay()` / `parse()` + `inferKind` (Task 1); all system code uses it — legacy `normalizePlateNumber` delegates (Task 4). ✅
- Step 2 Vehicle table: `plate_canonical` = existing `plateNumber` (`@unique` preserved), `plate_display` = new `plateDisplay` (Task 2 + Task 4 step 3). ✅
- Step 3 OcrEvidence raw/canonical/display + existing confidence/capturedAt preserved (Task 2); no overwriting of OCR data. ✅
- Step 4 Reservation lookup by canonical only — `findActiveByCanonicalPlate` (Task 5); audit confirms all existing plate-keyed queries already canonical. ✅
- Step 5 Session snapshot — canonical existed as `plateNumberConfirmed`; display snapshot `plateDisplay` added at check-in (Task 8); never live-read `vehicle.plateNumber` for history. ✅
- Step 6 API contract — OCR responses raw/canonical/display (Task 3), vehicle/gate responses `plateDisplay` (Task 4), staff UI uses `displayPlate` directly (Task 6). ✅
- Step 7 FE cleanup — delete `formatPlateForDisplay` (Task 7); `normalizePlate()` and `guessVehicleType()` don't exist in this codebase (verified); `normalizePlateForApi` kept as sanitization. ✅
- Step 8 Fuzzy matching foundation (Task 10, Sprint 4, explicitly optional/deferred; not wired to checkout). ✅
- Constraint 6 backward compat: legacy fields/endpoints untouched; new fields additive; FE falls back to canonical when display null. ✅
- Type consistency: `displayPlate` on OcrEvidence/OCR responses; `plateDisplay` on Vehicle/ParkingSession/session-summary types; both derived from the same `PlateFormatter.toDisplay()`. FE `OcrRecognizeResponse.displayPlate` matches backend; FE `GateScanResponse.plateDisplay` matches backend. ✅
- Known pre-existing failures excluded from verification gates (vehicles.service.spec compile error, vehicle-registrations DI) — documented in Global Constraints. ✅
