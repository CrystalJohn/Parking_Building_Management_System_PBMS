import {
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  Role,
  SessionStatus,
  SlotStatus,
  VehicleType,
  Zone,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const NOW = new Date('2026-06-25T03:00:00.000Z'); // 10:00 Asia/Ho_Chi_Minh
const SESSION_UUID = 'f1f5d4b8-f2ad-4a9a-8106-9869e708d1e6';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: {
    user: { findMany: jest.Mock };
    slot: { findMany: jest.Mock };
    parkingSession: { findMany: jest.Mock };
    reservation: { findMany: jest.Mock };
    payment: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
      slot: { findMany: jest.fn() },
      parkingSession: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      payment: { findMany: jest.fn() },
    };

    service = new AdminService(prisma as unknown as PrismaService);
  });

  describe('getSummary', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([
        { role: Role.admin, isActive: true },
        { role: Role.manager, isActive: true },
        { role: Role.staff, isActive: false },
        { role: Role.driver, isActive: true },
      ]);

      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ status: SlotStatus.occupied, vehicleType: VehicleType.car, floorNumber: 1, zone: Zone.A }),
        makeSlot({ status: SlotStatus.available, vehicleType: VehicleType.car, floorNumber: 1, zone: Zone.A }),
        makeSlot({ status: SlotStatus.reserved, vehicleType: VehicleType.motorbike, floorNumber: 2, zone: Zone.B }),
      ]);

      prisma.parkingSession.findMany.mockResolvedValue([
        { status: SessionStatus.active, checkOutTime: null },
        { status: SessionStatus.checkout_pending, checkOutTime: null },
        { status: SessionStatus.exit_authorized, checkOutTime: null },
        { status: SessionStatus.completed, checkOutTime: new Date('2026-06-25T02:00:00.000Z') },
      ]);

      prisma.reservation.findMany.mockResolvedValue([
        { status: ReservationStatus.active, createdAt: new Date('2026-06-25T01:00:00.000Z'), expiresAt: new Date('2026-06-25T01:30:00.000Z') },
      ]);

      prisma.payment.findMany.mockResolvedValue([
        makePayment({
          status: PaymentStatus.paid,
          method: PaymentMethod.cash,
          amount: 10000,
          paidAt: new Date('2026-06-24T18:00:00.000Z'),
        }),
        makePayment({
          status: PaymentStatus.paid,
          method: PaymentMethod.bank_qr,
          amount: 20000,
          provider: 'vnpay',
          paidAt: new Date('2026-06-25T01:00:00.000Z'),
        }),
        makePayment({
          status: PaymentStatus.paid,
          method: PaymentMethod.bank_qr,
          amount: 99999,
          provider: 'vnpay',
          paidAt: new Date('2026-06-24T16:59:59.000Z'),
        }),
        makePayment({ status: PaymentStatus.pending, method: PaymentMethod.bank_qr, amount: 30000 }),
      ]);
    });

    it('summary returns real user counts', async () => {
      const result = await service.getSummary(NOW);

      expect(result.users).toEqual({
        total: 4,
        active: 3,
        inactive: 1,
        byRole: { admin: 1, manager: 1, staff: 1, driver: 1 },
      });
    });

    it('summary returns slot occupancy counts', async () => {
      const result = await service.getSummary(NOW);

      expect(result.slots.total).toBe(3);
      expect(result.slots.available).toBe(1);
      expect(result.slots.reserved).toBe(1);
      expect(result.slots.occupied).toBe(1);
      expect(result.slots.occupancyRate).toBe(33.33);
      expect(result.slots.byVehicleType.car).toEqual({
        total: 2,
        available: 1,
        reserved: 0,
        occupied: 1,
      });
    });

    it('summary returns active/checkout_pending/exit_authorized session counts', async () => {
      const result = await service.getSummary(NOW);

      expect(result.sessions).toEqual({
        active: 1,
        checkoutPending: 1,
        exitAuthorized: 1,
        completedToday: 1,
      });
    });

    it('revenueToday uses paidAt and Asia/Ho_Chi_Minh day range', async () => {
      const result = await service.getSummary(NOW);

      expect(result.payments.revenueToday).toBe(30000);
      expect(result.payments.paidToday).toBe(2);
    });

    it('bankQr revenue uses method = bank_qr', async () => {
      const result = await service.getSummary(NOW);

      expect(result.payments.byMethod.bankQr).toBe(20000);
    });

    it('vnpay revenue uses provider = vnpay', async () => {
      const result = await service.getSummary(NOW);

      expect(result.payments.byProvider.vnpay).toBe(20000);
    });
  });

  describe('getOperationsFlags', () => {
    beforeEach(() => {
      prisma.parkingSession.findMany.mockResolvedValue([
        makeSession({
          status: SessionStatus.active,
          checkInTime: new Date('2026-06-23T00:00:00.000Z'),
        }),
        makeSession({
          status: SessionStatus.checkout_pending,
          sessionCode: 'PBMS-CHECKOUT',
          checkInTime: new Date('2026-06-25T01:50:00.000Z'),
          payment: makePaymentRelation({
            id: 'payment-checkout',
            method: PaymentMethod.cash,
          }),
        }),
        makeSession({
          status: SessionStatus.exit_authorized,
          sessionCode: 'PBMS-EXIT',
          checkInTime: new Date('2026-06-25T01:00:00.000Z'),
          payment: makePaymentRelation({
            id: 'payment-exit',
            paidAt: new Date('2026-06-25T02:40:00.000Z'),
          }),
        }),
      ]);

      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'payment-pending-bank-qr',
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          paidAt: null,
          expiredAt: new Date('2026-06-25T02:50:00.000Z'),
          session: {
            sessionCode: 'PBMS-QR',
            licensePlate: '59A-11111',
            checkInTime: new Date('2026-06-25T01:00:00.000Z'),
          },
        },
        {
          id: 'payment-failed',
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.failed,
          paidAt: null,
          expiredAt: new Date('2026-06-25T02:00:00.000Z'),
          session: {
            sessionCode: 'PBMS-FAILED',
            licensePlate: '59A-22222',
            checkInTime: new Date('2026-06-25T01:00:00.000Z'),
          },
        },
      ]);

      prisma.reservation.findMany.mockResolvedValue([
        {
          id: 'reservation-uuid-1',
          status: ReservationStatus.expired,
          createdAt: new Date('2026-06-25T00:00:00.000Z'),
          expiresAt: new Date('2026-06-25T00:30:00.000Z'),
          session: null,
        },
      ]);
    });

    it('long active session flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'long_active_session', severity: 'warning' }),
        ]),
      );
    });

    it('checkout pending too long flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'checkout_pending_too_long', severity: 'warning' }),
        ]),
      );
    });

    it('exit authorized not exited flag is produced and severity is critical', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags[0]).toEqual(
        expect.objectContaining({
          type: 'exit_authorized_not_exited',
          severity: 'critical',
        }),
      );
    });

    it('pending bank QR too long flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'pending_bank_qr_too_long', severity: 'warning' }),
        ]),
      );
    });

    it('failed payment flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'failed_payment', severity: 'warning' }),
        ]),
      );
    });

    it('expired reservation flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'expired_reservation', severity: 'info' }),
        ]),
      );
    });

    it('flags do not expose raw session UUID when sessionCode exists', async () => {
      const result = await service.getOperationsFlags(NOW);
      const serialized = JSON.stringify(result.flags);

      expect(serialized).not.toContain(SESSION_UUID);
      expect(serialized).toContain('PBMS-ACTIVE');
    });
  });

  describe('getPendingPayments', () => {
    beforeEach(() => {
      prisma.payment.findMany.mockResolvedValue([
        makeMonitoringPayment({
          id: 'payment-normal-qr',
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          expiredAt: new Date('2026-06-25T03:10:00.000Z'),
          sessionCode: 'PBMS-NORMAL',
        }),
        makeMonitoringPayment({
          id: 'payment-warning-qr',
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          expiredAt: new Date('2026-06-25T02:30:00.000Z'),
          sessionCode: 'PBMS-WARNING',
        }),
        makeMonitoringPayment({
          id: 'payment-cash',
          method: PaymentMethod.cash,
          status: PaymentStatus.pending,
          sessionCode: 'PBMS-CASH',
        }),
        makeMonitoringPayment({
          id: 'payment-critical-paid',
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.paid,
          paidAt: new Date('2026-06-25T02:40:00.000Z'),
          sessionStatus: SessionStatus.checkout_pending,
          sessionCode: 'PBMS-CRITICAL',
        }),
      ]);
    });

    it('pending bank_qr under threshold is normal', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items.find((payment) => payment.paymentId === 'payment-normal-qr');

      expect(item).toEqual(
        expect.objectContaining({
          risk: 'normal',
          reason: 'Payment is still within expected waiting time.',
        }),
      );
    });

    it('pending bank_qr over threshold is warning', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items.find((payment) => payment.paymentId === 'payment-warning-qr');

      expect(item).toEqual(
        expect.objectContaining({
          risk: 'warning',
          reason: 'Bank QR payment has been pending for more than 15 minutes.',
        }),
      );
    });

    it('pending cash has staff confirmation recommendation', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items.find((payment) => payment.paymentId === 'payment-cash');

      expect(item).toEqual(
        expect.objectContaining({
          risk: 'normal',
          reason: 'Cash payment is waiting for staff confirmation.',
          recommendedAction:
            'Staff should confirm cash payment at the gate after receiving money.',
        }),
      );
    });

    it('pending payments endpoint includes responsibleStaff field', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items[0];

      expect(item.responsibleStaff).toEqual(
        expect.objectContaining({
          id: expect.anything(),
          source: expect.any(String),
        }),
      );
    });

    it('responsibleStaff falls back safely to unknown when no staff relation exists', async () => {
      prisma.payment.findMany.mockResolvedValue([
        makeMonitoringPayment({
          id: 'payment-unassigned',
          sessionCode: 'PBMS-UNASSIGNED',
          sessionStaff: null,
        }),
      ]);

      const result = await service.getPendingPayments(NOW);

      expect(result.items[0].responsibleStaff).toEqual({
        id: null,
        name: null,
        phone: null,
        source: 'unknown',
      });
    });

    it('staff owner uses existing session check-in staff if available', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items.find((payment) => payment.paymentId === 'payment-normal-qr');

      expect(item?.responsibleStaff).toEqual({
        id: 'staff-checkin',
        name: 'Check In Staff',
        phone: '0900000003',
        source: 'checkin_staff',
      });
    });

    it('paid payment with non-exit_authorized session is critical', async () => {
      const result = await service.getPendingPayments(NOW);
      const item = result.items.find((payment) => payment.paymentId === 'payment-critical-paid');

      expect(item).toEqual(
        expect.objectContaining({
          risk: 'critical',
          reason: 'Payment is paid but session has not been authorized for exit.',
        }),
      );
    });

    it('bank_qr amount below 10000 is flagged as critical', async () => {
      prisma.payment.findMany.mockResolvedValue([
        makeMonitoringPayment({
          id: 'payment-low-amount',
          amount: 9000,
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          expiredAt: new Date('2026-06-25T03:10:00.000Z'),
        }),
      ]);

      const result = await service.getPendingPayments(NOW);

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          risk: 'critical',
          reason: 'Bank QR amount is below the minimum 10,000 VND payment requirement.',
          recommendedAction:
            'Regenerate the payment using the updated pricing rule or switch to cash.',
        }),
      );
    });

    it('response uses sessionCode instead of raw session UUID', async () => {
      const result = await service.getPendingPayments(NOW);
      const serialized = JSON.stringify(result.items);

      expect(serialized).not.toContain(SESSION_UUID);
      expect(serialized).toContain('PBMS-CRITICAL');
    });

    it('items are sorted by risk then age', async () => {
      const result = await service.getPendingPayments(NOW);

      expect(result.items.map((item) => item.paymentId)).toEqual([
        'payment-critical-paid',
        'payment-warning-qr',
        'payment-cash',
        'payment-normal-qr',
      ]);
      expect(result.summary).toEqual({
        total: 4,
        normal: 2,
        warning: 1,
        critical: 1,
        overdue: 2,
      });
    });

    it('ageMinutes remains available for sorting/risk', async () => {
      const result = await service.getPendingPayments(NOW);

      expect(result.items[0].ageMinutes).toEqual(expect.any(Number));
      expect(result.items[0].waitingLabel).toEqual(expect.any(String));
    });
  });
});

function makeSlot({
  status,
  vehicleType,
  floorNumber,
  zone,
}: {
  status: SlotStatus;
  vehicleType: VehicleType;
  floorNumber: number;
  zone: Zone;
}) {
  return {
    status,
    vehicleType,
    zone,
    floor: { floorNumber, name: `T${floorNumber}` },
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    amount: 10000,
    method: PaymentMethod.cash,
    status: PaymentStatus.paid,
    paidAt: new Date('2026-06-25T01:00:00.000Z'),
    provider: null,
    expiredAt: null,
    ...overrides,
  };
}

function makePaymentRelation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-uuid',
    method: PaymentMethod.bank_qr,
    status: PaymentStatus.paid,
    paidAt: null,
    expiredAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_UUID,
    sessionCode: 'PBMS-ACTIVE',
    licensePlate: '59A-12345',
    status: SessionStatus.active,
    checkInTime: new Date('2026-06-25T01:00:00.000Z'),
    payment: null,
    ...overrides,
  };
}

function makeMonitoringPayment(overrides: Record<string, unknown> = {}) {
  const sessionCode = (overrides.sessionCode as string | undefined) ?? 'PBMS-PAYMENT';
  const sessionStatus =
    (overrides.sessionStatus as SessionStatus | undefined) ?? SessionStatus.checkout_pending;
  const sessionStaff =
    overrides.sessionStaff === null
      ? null
      : {
          id: 'staff-checkin',
          fullName: 'Check In Staff',
          phone: '0900000003',
        };

  return {
    id: 'payment-monitoring',
    amount: 25000,
    method: PaymentMethod.bank_qr,
    provider: 'vnpay',
    status: PaymentStatus.pending,
    paidAt: null,
    expiredAt: null,
    receivedUser: null,
    session: {
      id: SESSION_UUID,
      sessionCode,
      licensePlate: '59A-33333',
      status: sessionStatus,
      checkInTime: new Date('2026-06-25T01:00:00.000Z'),
      checkedInBy: sessionStaff,
      checkedOutBy: null,
      slot: {
        code: 'T1-A-01',
        zone: Zone.A,
        floor: { floorNumber: 1, name: 'T1' },
      },
    },
    ...overrides,
  };
}
