# Reservation anti-spam quota & cooldown

## Goal

Implement server-enforced reservation quota (5 creates/10 minutes) and cancel cooldown (30 seconds), expose server snapshots, and update Driver reservation UI.

## Phases

- [completed] Inspect existing reservation API, schema, tests, and UI
- [completed] Add Prisma field/indexes and migration
- [completed] Add transactional quota/cooldown enforcement, snapshots, and throttling
- [completed] Add API/web types and Reservation UI states
- [completed] Add focused tests and run lint/build/Prisma validation

## Decisions

- Database quota is authoritative; browser never self-counts.
- Keep serializable allocation and existing active-reservation/BOLA rules.
- Use server timestamps for all displayed reset/cooldown countdowns.

## Errors Encountered

- Existing reservation Jest mocks did not include the new transactional `findMany`; updated test fixtures.
- Root TypeScript check still reports unrelated pre-existing duplicate simulation scripts and stale service tests outside this feature.
- Root workspace API build script has a Prisma schema cwd warning; direct `npx nest build` from `apps/api` passes.
