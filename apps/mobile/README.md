# @parking/mobile

React Native/Expo mobile app for the PBMS Driver role.

## Scope

- Driver authentication
- Reservation management
- Active parking session tracking
- Reservation QR display for staff check-in
- Parking history
- Driver profile
- Notification center placeholder

The mobile app calls PBMS backend APIs only. It does not integrate Plate Recognizer or payment SDKs directly. Checkout and payment are handled by the staff web gate flow, not by the driver mobile app.

## Tech Stack

- Expo + React Native
- TypeScript
- React Navigation
- TanStack Query
- Zustand
- Axios
- Expo SecureStore

## Run The App

Install dependencies from the monorepo root:

```bash
npm install
```

Install mobile dependencies locally after root install:

```bash
npm install --prefix apps/mobile
```

Start Expo:

```bash
npm run start --workspace=apps/mobile
```

Other scripts:

```bash
npm run android --workspace=apps/mobile
npm run ios --workspace=apps/mobile
npm run web --workspace=apps/mobile
npm run typecheck --workspace=apps/mobile
```

## API Base URL

Set the backend URL with:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3001
```

Android emulator:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
```

Physical device:

```bash
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001
```

## Implemented Screens

- Auth stack
  - Login
  - Register
  - Forgot Password placeholder
- Main tabs
  - Home
  - Reservations
  - Active Session
  - History
  - Profile
- Stack screens
  - Reservation Detail
  - Notification Center placeholder

## Current Backend Dependencies

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/logout`
- `GET /slots/availability`
- `GET /reservations/my`
- `POST /reservations`
- `DELETE /reservations/:id`
- `GET /sessions/my-active`
- `GET /sessions/my-history`

## Known Gaps

- Forgot password is a UI placeholder until backend reset-password APIs exist.
- Reservation detail uses list data from `GET /reservations/my` because no reservation detail endpoint is currently used.
- Reservation QR currently uses the backend reservation ID because the reservation model does not yet expose a separate friendly reservation code.
- Plate recognition remains backend/staff-side only. The mobile app should not call Plate Recognizer directly.
