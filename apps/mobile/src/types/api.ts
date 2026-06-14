export type Role = 'admin' | 'manager' | 'staff' | 'driver';
export type VehicleType = 'car' | 'motorbike';
export type ReservationStatus = 'active' | 'fulfilled' | 'expired' | 'cancelled';
export type SessionStatus = 'active' | 'checkout_pending' | 'exit_authorized' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
export type PaymentMethod = 'cash' | 'bank_qr';
export type ExitAuthorizationStatus = 'NOT_READY' | 'AUTHORIZED' | 'EXIT_CONFIRMED';

export type User = {
  id: string;
  phone: string;
  role: Role;
  fullName?: string | null;
};

export type AuthResponse = {
  user: User;
  access_token: string;
};

export type LoginPayload = {
  phone: string;
  password: string;
};

export type RegisterPayload = LoginPayload & {
  fullName: string;
};

export type Reservation = {
  id: string;
  vehicleType: VehicleType;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  licensePlate?: string | null;
  slot?: {
    id: number;
    code: string;
    floorId: number;
    zone: string;
    floor?: {
      id: number;
      floorNumber: number;
      name: string;
    };
  };
};

export type CreateReservationResponse =
  | Reservation
  | {
      reservation: Omit<Reservation, 'slot'>;
      slot?: {
        id: number;
        code: string;
        floorId?: number;
        zone: string;
        floor?: {
          id: number;
          floorNumber: number;
          name: string;
        };
      };
    };

export type ParkingSession = {
  id: string;
  licensePlate: string;
  vehicleType: VehicleType;
  status: SessionStatus;
  checkInTime: string;
  checkOutTime?: string | null;
  feeAmount: number;
  penaltyAmount: number;
  isPaid: boolean;
  slot?: {
    id: number;
    code: string;
    floorId: number;
    zone: string;
    floor?: {
      id: number;
      floorNumber: number;
      name: string;
    };
  };
};

export type Payment = {
  id: string;
  sessionId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt?: string | null;
};

export type SlotAvailabilityItem = {
  floorId: number;
  floorNumber: number;
  floorName: string;
  zone: string;
  vehicleType: VehicleType;
  available: number;
  total: number;
};

export type SlotAvailability = SlotAvailabilityItem[];

export type QrCodeResponse = {
  qrCode?: string;
  dataUrl?: string;
  qrDataUrl?: string;
  qrCodeDataUrl?: string;
  image?: string;
  value?: string;
};
