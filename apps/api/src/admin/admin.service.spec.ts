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
    floor: { findMany: jest.Mock };
    slot: { findMany: jest.Mock };
    parkingSession: { findMany: jest.Mock; findUnique: jest.Mock };
    reservation: { findMany: jest.Mock };
    payment: { findMany: jest.Mock };
    ocrEvidence: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
      floor: { findMany: jest.fn() },
      slot: { findMany: jest.fn() },
      parkingSession: { findMany: jest.fn(), findUnique: jest.fn() },
      reservation: { findMany: jest.fn() },
      payment: { findMany: jest.fn() },
      ocrEvidence: { findMany: jest.fn() },
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
        { status: SessionStatus.active, checkInTime: new Date('2026-06-25T00:00:00.000Z'), checkOutTime: null, reservationId: null },
        { status: SessionStatus.checkout_pending, checkInTime: new Date('2026-06-25T00:30:00.000Z'), checkOutTime: null, reservationId: null },
        { status: SessionStatus.exit_authorized, checkInTime: new Date('2026-06-25T01:00:00.000Z'), checkOutTime: null, reservationId: null },
        { status: SessionStatus.completed, checkInTime: new Date('2026-06-25T01:30:00.000Z'), checkOutTime: new Date('2026-06-25T02:00:00.000Z'), reservationId: null },
      ]);

      prisma.reservation.findMany.mockResolvedValue([
        { status: ReservationStatus.active, createdAt: new Date('2026-06-25T01:00:00.000Z'), expiresAt: new Date('2026-06-25T01:30:00.000Z'), session: null },
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

    it('summary returns slot occupancy counts', async () => {
      const result = await service.getSummary(NOW);

      expect(result.todayStatus.slots.total).toBe(3);
      expect(result.todayStatus.slots.available).toBe(1);
      expect(result.todayStatus.slots.reserved).toBe(1);
      expect(result.todayStatus.slots.occupied).toBe(1);
      expect(result.todayStatus.slots.occupancyRate).toBe(33.33);
      expect(result.todayStatus.slots.byVehicleType.car).toEqual({
        total: 2,
        available: 1,
        reserved: 0,
        occupied: 1,
      });
    });

    it('documents building and floor occupancy denominators separately', async () => {
      const result = await service.getSummary(NOW);

      expect(result.todayStatus.slots.occupancyRate).toBe(33.33);
      expect(result.todayStatus.slots.byFloor).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            floor: 'T1',
            total: 2,
            occupied: 1,
            occupancyRate: 50,
          }),
          expect.objectContaining({
            floor: 'T2',
            total: 1,
            occupied: 0,
            occupancyRate: 0,
          }),
        ]),
      );
    });

    it('summary returns current open session counts in todayStatus', async () => {
      const result = await service.getSummary(NOW);

      expect(result.todayStatus.openSessions).toEqual({
        active: 1,
        checkoutPending: 1,
        exitAuthorized: 1,
        total: 3,
      });
    });

    it('report revenue uses paidAt and Asia/Ho_Chi_Minh day range', async () => {
      const result = await service.getSummary(NOW);

      expect(result.report.revenue).toBe(30000);
      expect(result.report.paidPayments).toBe(2);
    });

    it('bankQr revenue uses method = bank_qr', async () => {
      const result = await service.getSummary(NOW);

      expect(result.report.revenueByMethod.bankQr).toBe(20000);
    });

    it('vnpay revenue uses provider = vnpay', async () => {
      const result = await service.getSummary(NOW);

      expect(result.report.revenueByProvider.vnpay).toBe(20000);
    });

    it('report uses selected-date timestamps while todayStatus remains current', async () => {
      prisma.parkingSession.findMany.mockResolvedValue([
        {
          status: SessionStatus.checkout_pending,
          checkInTime: new Date('2026-06-24T18:30:00.000Z'),
          checkOutTime: null,
          reservationId: null,
        },
        {
          status: SessionStatus.completed,
          checkInTime: new Date('2026-06-24T16:59:59.000Z'),
          checkOutTime: new Date('2026-06-24T18:15:00.000Z'),
          reservationId: null,
        },
        {
          status: SessionStatus.completed,
          checkInTime: new Date('2026-06-25T01:00:00.000Z'),
          checkOutTime: new Date('2026-06-25T02:00:00.000Z'),
          reservationId: 'reservation-1',
        },
      ]);
      prisma.reservation.findMany.mockResolvedValue([
        {
          status: ReservationStatus.fulfilled,
          createdAt: new Date('2026-06-24T18:00:00.000Z'),
          expiresAt: new Date('2026-06-24T18:20:00.000Z'),
          session: { checkInTime: new Date('2026-06-25T01:00:00.000Z') },
        },
        {
          status: ReservationStatus.expired,
          createdAt: new Date('2026-06-24T16:00:00.000Z'),
          expiresAt: new Date('2026-06-24T18:10:00.000Z'),
          session: null,
        },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        makePayment({
          status: PaymentStatus.paid,
          method: PaymentMethod.bank_qr,
          amount: 20000,
          provider: 'vnpay',
          paidAt: new Date('2026-06-24T18:05:00.000Z'),
        }),
        makePayment({
          status: PaymentStatus.paid,
          method: PaymentMethod.cash,
          amount: 10000,
          paidAt: new Date('2026-06-25T01:00:00.000Z'),
        }),
        makePayment({
          status: PaymentStatus.pending,
          method: PaymentMethod.bank_qr,
          amount: 30000,
          expiredAt: new Date('2026-06-25T02:59:00.000Z'),
        }),
      ]);

      const result = await service.getSummary(NOW);

      expect(result.todayStatus.openSessions.checkoutPending).toBe(1);
      expect(result.todayStatus.pendingPayments).toBe(1);
      expect(result.report).toEqual(
        expect.objectContaining({
          checkIns: 2,
          checkOuts: 2,
          completedSessions: 2,
          paidPayments: 2,
          revenue: 30000,
          reservationCheckIns: 1,
          expiredReservations: 2,
        }),
      );
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
            id: 'session-pending-bank-qr',
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
            id: 'session-failed-payment',
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
          expect.objectContaining({
            type: 'long_active_session',
            severity: 'warning',
            sessionId: SESSION_UUID,
          }),
        ]),
      );
    });

    it('checkout pending too long flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'checkout_pending_too_long',
            severity: 'warning',
            sessionId: SESSION_UUID,
          }),
        ]),
      );
    });

    it('exit authorized not exited flag is produced and severity is critical', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags[0]).toEqual(
        expect.objectContaining({
          type: 'exit_authorized_not_exited',
          severity: 'critical',
          sessionId: SESSION_UUID,
        }),
      );
    });

    it('pending bank QR too long flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'pending_bank_qr_too_long',
            severity: 'warning',
            sessionId: 'session-pending-bank-qr',
          }),
        ]),
      );
    });

    it('failed payment flag is produced', async () => {
      const result = await service.getOperationsFlags(NOW);

      expect(result.flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'failed_payment',
            severity: 'warning',
            sessionId: 'session-failed-payment',
          }),
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

    it('flags expose sessionId alongside sessionCode for evidence drill-down', async () => {
      const result = await service.getOperationsFlags(NOW);
      const serialized = JSON.stringify(result.flags);

      expect(serialized).toContain(SESSION_UUID);
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

  describe('getReservationAudit', () => {
    beforeEach(() => {
      prisma.reservation.findMany
        .mockResolvedValueOnce([
          makeReservationAudit({
            id: 'reservation-active',
            status: ReservationStatus.active,
            expiresAt: new Date('2026-06-25T03:04:00.000Z'),
            slot: {
              code: 'T1-A-03',
              status: SlotStatus.reserved,
              floor: { floorNumber: 1, name: 'T1' },
            },
          }),
        ])
        .mockResolvedValueOnce([
          makeReservationAudit({
            id: 'reservation-expired',
            status: ReservationStatus.expired,
            expiresAt: new Date('2026-06-25T01:00:00.000Z'),
            slot: {
              code: 'T2-B-02',
              status: SlotStatus.available,
              floor: { floorNumber: 2, name: 'T2' },
            },
          }),
        ])
        .mockResolvedValueOnce([
          makeReservationAudit({
            id: 'reservation-fulfilled',
            status: ReservationStatus.fulfilled,
            session: {
              sessionCode: 'PBMS-RSV',
              checkInTime: new Date('2026-06-25T02:30:00.000Z'),
            },
          }),
        ]);
    });

    it('counts active reservations with reserved slots in currentlyReserved', async () => {
      const result = await service.getReservationAudit(NOW);

      expect(result.summary.currentlyReserved).toBe(1);
      expect(result.watchlist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'reservation-active',
            status: ReservationStatus.active,
            slotCode: 'T1-A-03',
          }),
        ]),
      );
    });

    it('counts active reservations expiring within 5 minutes in expiringSoon', async () => {
      const result = await service.getReservationAudit(NOW);

      expect(result.summary.expiringSoon).toBe(1);
      expect(result.watchlist[0]).toEqual(
        expect.objectContaining({
          id: 'reservation-active',
          timeLeftMinutes: 4,
        }),
      );
    });

    it('counts expired reservations on the selected day', async () => {
      const result = await service.getReservationAudit(NOW);

      expect(result.summary.expiredToday).toBe(1);
      expect(result.watchlist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'reservation-expired',
            status: ReservationStatus.expired,
          }),
        ]),
      );
    });

    it('counts fulfilled reservations by linked session check-in on the selected day', async () => {
      const result = await service.getReservationAudit(NOW);

      expect(result.summary.fulfilledToday).toBe(1);
      expect(result.watchlist).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'reservation-fulfilled',
            status: ReservationStatus.fulfilled,
            fulfilledSessionCode: 'PBMS-RSV',
          }),
        ]),
      );
    });
  });

  describe('getSessionEvidence', () => {
    beforeEach(() => {
      prisma.parkingSession.findUnique = jest.fn().mockResolvedValue({
        id: SESSION_UUID,
        sessionCode: 'PBMS-EVIDENCE',
        licensePlate: '59A12345',
        plateNumberConfirmed: '59A12345',
        vehicleType: VehicleType.car,
        status: SessionStatus.active,
        checkInTime: new Date('2026-06-25T01:00:00.000Z'),
        checkOutTime: null,
        slot: { code: 'T1-A-01' },
      });
      prisma.ocrEvidence.findMany.mockResolvedValue([
        {
          id: 'evidence-check-in-new',
          eventType: 'check_in',
          thumbnailKey: 'thumb-check-in',
          imageKey: 'image-check-in',
          imageExpiresAt: null,
          imageDeletedAt: null,
          thumbnailExpiresAt: null,
          thumbnailDeletedAt: null,
          ocrPlate: '59A12345',
          confirmedPlate: '59A12345',
          ocrConfidence: 0.92,
          capturedAt: new Date('2026-06-25T01:01:00.000Z'),
          providerTimestamp: new Date('2026-06-25T01:01:05.000Z'),
          staff: { fullName: 'Staff One', phone: '0900000001' },
        },
        {
          id: 'evidence-check-out',
          eventType: 'check_out',
          thumbnailKey: null,
          imageKey: null,
          imageExpiresAt: new Date('2026-06-24T01:00:00.000Z'),
          imageDeletedAt: new Date('2026-06-25T03:00:00.000Z'),
          thumbnailExpiresAt: null,
          thumbnailDeletedAt: null,
          ocrPlate: '59A12345',
          confirmedPlate: '59A12345',
          ocrConfidence: 0.88,
          capturedAt: new Date('2026-06-25T02:01:00.000Z'),
          providerTimestamp: null,
          staff: { fullName: null, phone: '0900000002' },
        },
      ]);
    });

    it('returns latest check-in and check-out evidence with image status', async () => {
      const result = await service.getSessionEvidence(SESSION_UUID);

      expect(result.session).toEqual(
        expect.objectContaining({
          id: SESSION_UUID,
          sessionCode: 'PBMS-EVIDENCE',
          slotCode: 'T1-A-01',
        }),
      );
      expect(result.checkInEvidence).toEqual(
        expect.objectContaining({
          id: 'evidence-check-in-new',
          eventType: 'check_in',
          imageStatus: 'available',
          thumbnailUrl: '/api/ocr-evidences/evidence-check-in-new/thumbnail',
          imageUrl: '/api/ocr-evidences/evidence-check-in-new/image',
          staffName: 'Staff One',
        }),
      );
      expect(result.checkOutEvidence).toEqual(
        expect.objectContaining({
          id: 'evidence-check-out',
          eventType: 'check_out',
          imageStatus: 'expired',
          staffPhone: '0900000002',
        }),
      );
    });
  });

  // â”€â”€â”€ getSlotOccupancyMap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getSlotOccupancyMap', () => {
    const FLOOR = { floorNumber: 1, name: 'T1', slots: [] };

    beforeEach(() => {
      prisma.slot.findMany.mockResolvedValue([]);
      prisma.parkingSession.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.reservation.findMany.mockResolvedValue([]);
    });

    it('returns metadata (generatedAt, thresholds, floors)', async () => {
      prisma.floor.findMany.mockResolvedValue([]);
      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.generatedAt).toBe(NOW.toISOString());
      expect(result.thresholds.longActiveSessionHours).toBe(24);
      expect(result.thresholds.warningActiveHours).toBe(12);
      expect(result.floors).toEqual([]);
    });

    it('slot with no open session has session=null and risk=normal', async () => {
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ status: SlotStatus.available })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([]);

      const result = await service.getSlotOccupancyMap(NOW);
      const slot = result.floors[0].zones[0].slots[0];
      expect(slot.session).toBeNull();
      expect(slot.risk.level).toBe('normal');
    });

    it('assigns risk=normal for a session under 12h', async () => {
      const checkInTime = new Date(NOW.getTime() - 5 * 60 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([makeMapSession({ checkInTime, slotId: 1 })]);

      const result = await service.getSlotOccupancyMap(NOW);
      const slot = result.floors[0].zones[0].slots[0];
      expect(slot.risk.level).toBe('normal');
      expect(slot.session?.plate).toBe('59A-12345');
      expect(slot.session?.durationMinutes).toBe(300);
    });

    it('assigns risk=warning for a session between 12h and 24h', async () => {
      const checkInTime = new Date(NOW.getTime() - 13 * 60 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([makeMapSession({ checkInTime, slotId: 1 })]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].risk.level).toBe('warning');
    });

    it('assigns risk=critical for a session >= 24h', async () => {
      const checkInTime = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([makeMapSession({ checkInTime, slotId: 1 })]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].risk.level).toBe('critical');
    });

    it('assigns risk=critical for checkout_pending > 30m', async () => {
      const checkInTime = new Date(NOW.getTime() - 60 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({ checkInTime, slotId: 1, status: SessionStatus.checkout_pending }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].risk.level).toBe('critical');
    });

    it('assigns risk=critical for exit_authorized > 10m', async () => {
      const checkInTime = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
      const paidAt = new Date(NOW.getTime() - 20 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({
          checkInTime,
          slotId: 1,
          status: SessionStatus.exit_authorized,
          payment: { method: PaymentMethod.cash, status: PaymentStatus.paid, paidAt, expiredAt: null },
        }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].risk.level).toBe('critical');
    });

    it('assigns risk=critical for Bank QR payment pending > 15m', async () => {
      const checkInTime = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
      const expiredAt = new Date(NOW.getTime() - 5 * 60 * 1000);
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({
          checkInTime,
          slotId: 1,
          status: SessionStatus.checkout_pending,
          payment: { method: PaymentMethod.bank_qr, status: PaymentStatus.pending, paidAt: null, expiredAt },
        }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].risk.level).toBe('critical');
    });

    it('includes thumbnailUrl when check-in OCR evidence has thumbnailKey', async () => {
      const EVI_ID = 'evi-uuid-1234';
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({
          slotId: 1,
          ocrEvidences: [{ id: EVI_ID, thumbnailKey: 'uploads/thumb/abc.jpg', thumbnailDeletedAt: null, thumbnailExpiresAt: null }],
        }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].session?.thumbnailUrl).toBe(`/api/ocr-evidences/${EVI_ID}/thumbnail`);
    });

    it('returns thumbnailUrl=null when evidence has no thumbnailKey', async () => {
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({
          slotId: 1,
          ocrEvidences: [{ id: 'evi-no-thumb', thumbnailKey: null, thumbnailDeletedAt: null, thumbnailExpiresAt: null }],
        }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].session?.thumbnailUrl).toBeNull();
    });

    it('returns thumbnailUrl=null when thumbnail has been deleted', async () => {
      prisma.floor.findMany.mockResolvedValue([{ ...FLOOR, slots: [makeMapSlot({ id: 1, status: SlotStatus.occupied })] }]);
      prisma.parkingSession.findMany.mockResolvedValue([
        makeMapSession({
          slotId: 1,
          ocrEvidences: [{
            id: 'evi-deleted',
            thumbnailKey: 'uploads/thumb/deleted.jpg',
            thumbnailDeletedAt: new Date('2026-06-20T00:00:00.000Z'),
            thumbnailExpiresAt: null,
          }],
        }),
      ]);

      const result = await service.getSlotOccupancyMap(NOW);
      expect(result.floors[0].zones[0].slots[0].session?.thumbnailUrl).toBeNull();
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

function makeReservationAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-uuid',
    status: ReservationStatus.active,
    vehicleType: VehicleType.car,
    createdAt: new Date('2026-06-25T01:00:00.000Z'),
    expiresAt: new Date('2026-06-25T03:30:00.000Z'),
    driver: {
      fullName: 'Driver One',
      phone: '0900000000',
    },
    vehicle: {
      plateNumber: '59A12345',
      vehicleType: VehicleType.car,
    },
    slot: {
      code: 'T1-A-01',
      status: SlotStatus.reserved,
      floor: { floorNumber: 1, name: 'T1' },
    },
    session: null,
    ...overrides,
  };
}

function makeMapSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: 'T1-A-01',
    status: SlotStatus.available,
    vehicleType: VehicleType.car,
    zone: Zone.A,
    slotNumber: 1,
    ...overrides,
  };
}

function makeMapSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_UUID,
    sessionCode: 'PBMS-MAP-001',
    licensePlate: '59A-12345',
    status: SessionStatus.active,
    checkInTime: NOW,
    slotId: 1,
    payment: null,
    ocrEvidences: [],
    ...overrides,
  };
}





