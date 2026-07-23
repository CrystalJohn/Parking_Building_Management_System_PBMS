# Findings

- `Reservation` has no `cancelledAt`; it has `createdAt`, `expiresAt`, and `status`.
- `ReservationsService.create()` already uses a serializable transaction and checks one active reservation by driver or vehicle.
- `cancel()` updates status and releases the slot in a transaction, but does not record cancellation time.
- `ReservationsController` has no quota endpoint or request throttle.
- Web `driver-api.ts` currently returns only reservation/slot data; cancel returns `void`.
