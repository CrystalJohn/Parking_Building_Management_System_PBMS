export type Role = 'admin' | 'manager' | 'staff' | 'driver';
export type VehicleType = 'car' | 'motorbike';
export type ReservationStatus = 'active' | 'fulfilled' | 'expired' | 'cancelled';
export type SessionStatus = 'active' | 'checkout_pending' | 'exit_authorized' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank_qr';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
export type NotificationType = 'session_started' | 'reservation_expiring_soon';

export type DriverVehicle = {
  id: string;
  plateNumber: string;
  vehicleType: VehicleType;
  isActive: boolean;
  registeredAt: string;
  linkedRole: 'owner' | 'driver';
  activeSubscription: {
    id: string;
    planType: 'casual' | 'monthly' | 'yearly';
    validFrom: string;
    validTo: string;
  } | null;
};

export type VehicleRegistrationRequest = {
  id: string;
  driverId: string;
  plateNumber: string;
  vehicleType: VehicleType;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  rejectReason?: string | null;
  createdAt: string;
};

export type User = {
  id: string;
  phone: string;
  username?: string | null;
  role: Role;
  fullName?: string | null;
};

export type AuthResponse = {
  user: User;
  access_token: string;
};

export type LoginPayload = {
  phone?: string;
  identifier?: string;
  password: string;
};

export type RegisterPayload = {
  phone: string;
  password: string;
  fullName: string;
};

export type Reservation = {
  id: string;
  vehicleId?: string | null;
  reservationCode?: string;
  vehicleType: VehicleType;
  plannedArrivalAt?: string | null;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  licensePlate?: string | null;
  vehicle?: {
    id: string;
    plateNumber: string;
    vehicleType: VehicleType;
  } | null;
  driver?: {
    fullName?: string | null;
    phone?: string | null;
  } | null;
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

export type CreateReservationRequest = {
  vehicleId: string;
  plannedArrivalAt: string;
};

export type ReservationAvailabilityRequest = {
  vehicleType: VehicleType;
  plannedArrivalAt: string;
};

export type ReservationCheckInQr = {
  reservationId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  refreshAfterMs: number;
  vehicle: {
    id: string;
    plateNumber: string;
    vehicleType: VehicleType;
  };
  slot: {
    id: number;
    code: string;
    zone: string;
    floor: {
      id: number;
      floorNumber: number;
      name: string;
    };
  };
};

export type ReservationAvailability = {
  vehicleType: VehicleType;
  plannedArrivalAt: string;
  availableCount: number;
  reservedCount: number;
  occupiedCount: number;
  isAvailable: boolean;
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
  sessionCode?: string;
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

export type PaymentWorkflow = {
  session: ParkingSession;
  payment: {
    id: string;
    sessionId: string;
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    paidAt?: string | null;
    receivedBy?: string | null;
    checkoutUrl?: string | null;
    qrCode?: string | null;
    expiredAt?: string | null;
  } | null;
  slot: {
    id: number;
    code: string;
    status: string;
    zone: string;
    floor?: {
      id: number;
      floorNumber: number;
      name: string;
    };
  };
};

export type DriverNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedReservationId?: string | null;
  relatedSessionId?: string | null;
  createdAt: string;
  readAt?: string | null;
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

