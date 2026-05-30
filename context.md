# PBMS — Session Context

## Project Overview

**Parking Building Management System (PBMS)** — NestJS + React + PostgreSQL + Prisma
- 3 floors, 90 slots (30 car Zone A + 60 motorbike Zone B)
- Automated slot allocation with Strategy Pattern

---

## Use Case Diagram (Finalized)

### Actors (4 human, no system actors)

- **Guest** → **Auth User** → **Driver** (inheritance chain)
- **Manager**, **Staff**, **Admin** (right side)

### Use Cases by Actor

| Actor | Use Cases |
|---|---|
| Guest | View slot availability, Register account |
| Auth User | Login (extend: Reset password), Logout, View personal info, Change personal info, Change password |
| Driver | Make reservation (include: Allocate slot), View parking history, Display QR code, Make payment |
| Staff | Check in vehicle (extend: Allocate slot — walk-in only), Check out vehicle (include: Scan QR code, include: Confirm cash payment), Handle lost ticket (extend: Escalate case) |
| Manager | View dashboard, View report, Run simulation, Configure pricing, Set slot maintenance |
| Admin | Manage users, Manage roles |

### Key Relationships

- `Make reservation` **include** `Allocate slot` — reservation always triggers allocation
- `Check in vehicle` **extend** `Allocate slot` — only for walk-in (no prior reservation)
- `Check out vehicle` **include** `Scan QR code` — always scan to identify session
- `Check out vehicle` **include** `Confirm cash payment` — always collect fee on exit
- `Escalate case` **extend** `Handle lost ticket` — only when staff cannot resolve
- `Reset password` **extend** `Login` — only when user forgets password

### Design Decisions

1. **Removed "Manage personal account"** — was incorrectly using include for optional sub-actions. Replaced with 3 independent use cases (View/Change info, Change password).
2. **Removed "Pay by cash" as include** — redundant when only 1 payment method exists. Keep "Make payment" as single use case; future online payment would be an extend.
3. **Removed system actors** (Authentication Service, Notification Service, Payment Gateway, Gate Hardware) — these are internal components, not external systems. Use case diagrams model user goals, not implementation details.
4. **Allocate Slot is the core feature**, not Reservation. Reservation is just one trigger for allocation.

---

## Core Feature: Automated Slot Allocation

### Why automated (not driver-choice)?

1. **Driver lacks global info** — doesn't know real-time occupancy per floor
2. **Free-choice causes herd effect** — everyone picks floor 1, upper floors empty
3. **Multi-floor building** — driver can't see available slots without driving up each floor
4. **System has real-time data** — occupancy, maintenance status, reservations, peak patterns
5. **Research contribution** — proving automated allocation improves floor distribution

### 3 Strategies (Strategy Pattern)

| Strategy | Logic | Purpose |
|---|---|---|
| Balanced Occupancy | Lowest occupancy floor first | Default — even distribution |
| Lowest Floor | Always fill lowest floor | Baseline comparison |
| Random | Random slot selection | Control group (simulates free-choice) |

### Simulation Results (30 seeds x 3 strategies, 0.4/min, 24h)

| Metric | Balanced | Lowest Floor | Random |
|---|---|---|---|
| Rejection rate | 3.00% ± 1.33 | 3.00% ± 1.33 | 3.50% ± 1.50 |
| Peak hr rejection | 3.05% ± 2.08 | 3.05% ± 2.08 | 3.88% ± 2.68 |
| **Floor variance** | **28.0** | **947.6** | 24.2 |

**Key finding:** Balanced Occupancy dramatically improves floor distribution (variance 28 vs 947) without significantly affecting rejection rate (capacity is the bottleneck).

---

## UML Knowledge (for presentation)

### <<include>> vs <<extend>>

| | <<include>> | <<extend>> |
|---|---|---|
| Meaning | A **always** calls B | B **sometimes** happens in A |
| Arrow direction | A → B (A calls B) | B → A (B extends A) |
| Condition | None — always executes | Has condition (extension point) |

### Presentation Analogy

> "Like airline seat assignment — passengers don't freely choose any seat. The airline allocates seats to balance weight, optimize boarding, and ensure safety compliance. Our parking system allocates slots to balance floor load."

---

## Research Context (NCKH-WDP)

### 4 Research Questions

- **RQ1:** How does floor/zone segmentation by vehicle type affect utilization?
- **RQ2:** Does automated allocation reduce search time vs free-choice?
- **RQ3:** Which criteria should be prioritized when allocating slots?
- **RQ4:** Does the algorithm improve utilization during peak hours?

### Research Gap

No existing study combines: multi-floor + motorcycle/car zones + automated allocation + Vietnam context.

### Thesis Defense Strategy

- Do NOT claim rejection rate improvement (CI overlaps)
- DO claim operational efficiency: even floor distribution, reduced wear on single floor, predictable operations
- Reframe as "intelligent allocation" not "AI" (rule-based heuristic, not ML/DL)

---

## Tech Stack

- **Backend:** NestJS, Prisma, PostgreSQL
- **Frontend:** React
- **Testing:** 106 tests passing
- **Simulation:** Poisson arrival + hourly profile + check-out events

---

## Sprint Progress (1-4 Complete)

Tasks 14-34 done. Full lifecycle implemented: reservation → check-in → parking → check-out → payment. Plus: simulation, reports, config, admin management, allocation strategies.
