import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, SessionStatus, SlotStatus, VehicleType, Zone } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayosService } from './payos.service';
import { PaymentsService } from './payments.service';

const makeFloor = () => ({
  id: 1,
  floorNumber: 1,
  name: 'T1',
});

const makeSlot = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  floorId: 1,
  zone: Zone.A,
  slotNumber: 1,
  code: 'T1-A-01',
  status: SlotStatus.occupied,
  vehicleType: VehicleType.car,
  walkingDistance: 20,
  floor: makeFloor(),
  ...overrides,
});

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-uuid-1',
  sessionCode: 'PBMS-SESSION',
  licensePlate: '59A-12345',
  vehicleType: VehicleType.car,
  checkInTime: new Date('2026-06-15T08:00:00Z'),
  checkOutTime: null,
  status: SessionStatus.checkout_pending,
  feeAmount: 24000,
  penaltyAmount: 0,
  isPaid: false,
  slotId: 1,
  slot: makeSlot(),
  payment: null,
  ...overrides,
});

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-uuid-1',
  sessionId: 'session-uuid-1',
  amount: 24000,
  method: PaymentMethod.bank_qr,
  status: 'pending',
  paidAt: null,
  receivedBy: null,
  provider: 'payos',
  providerRef: 'payos-link-1',
  providerOrderCode: '900001',
  checkoutUrl: 'https://pay.payos.vn/checkout/900001',
  qrCode: '000201010212PAYOS',
  expiredAt: new Date(Date.now() + 10 * 60 * 1000),
  providerPayload: { checkoutUrl: 'https://pay.payos.vn/checkout/900001' },
  ...overrides,
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    parkingSession: { findUnique: jest.Mock; update: jest.Mock };
    payment: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let payos: {
    createPaymentLink: jest.Mock;
    verifyWebhook: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      parkingSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    payos = {
      createPaymentLink: jest.fn(),
      verifyWebhook: jest.fn(),
    };

    service = new PaymentsService(
      prisma as unknown as PrismaService,
      payos as unknown as PayosService,
    );
  });

  describe('createBankQrPayment', () => {
    it('rejects non-existent session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(null);

      await expect(service.createBankQrPayment('missing-session', 'staff-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects active session before checkout is requested', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ status: SessionStatus.active }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff-uuid')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects completed session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ status: SessionStatus.completed, isPaid: true }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff-uuid')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects already paid session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({
          isPaid: true,
          payment: makePayment({ status: 'paid', paidAt: new Date() }),
        }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff-uuid')).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns existing pending unexpired bank_qr payment idempotently', async () => {
      const payment = makePayment();
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ payment }),
      );

      const result = await service.createBankQrPayment('session-uuid-1', 'staff-uuid');

      expect(payos.createPaymentLink).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.payment.id).toBe('payment-uuid-1');
      expect(result.payment.method).toBe(PaymentMethod.bank_qr);
      expect(result.session.status).toBe(SessionStatus.checkout_pending);
      expect(result.slot.status).toBe(SlotStatus.occupied);
    });

    it('creates or updates pending bank_qr payment without authorizing exit or releasing slot', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ payment: makePayment({ method: PaymentMethod.cash, checkoutUrl: null, qrCode: null }) }),
      );
      payos.createPaymentLink.mockResolvedValue({
        provider: 'payos',
        providerRef: 'payos-link-2',
        providerOrderCode: '900002',
        checkoutUrl: 'https://pay.payos.vn/checkout/900002',
        qrCode: '000201010212PAYOS2',
        expiredAt: new Date('2026-06-15T08:15:00Z'),
        providerPayload: { paymentLinkId: 'payos-link-2' },
      });

      let txCalls: { paymentUpsert?: unknown; sessionUpdate?: unknown; slotUpdate?: unknown } = {};
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            upsert: jest.fn().mockImplementation((args) => {
              txCalls.paymentUpsert = args;
              return Promise.resolve(makePayment({
                id: 'payment-uuid-2',
                providerRef: 'payos-link-2',
                providerOrderCode: '900002',
                checkoutUrl: 'https://pay.payos.vn/checkout/900002',
                qrCode: '000201010212PAYOS2',
              }));
            }),
          },
          parkingSession: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.sessionUpdate = args;
              return Promise.resolve({});
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.slotUpdate = args;
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.createBankQrPayment('session-uuid-1', 'staff-uuid');

      expect(payos.createPaymentLink).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-uuid-1',
          sessionCode: 'PBMS-SESSION',
          amount: 24000,
        }),
      );
      expect(txCalls.paymentUpsert).toEqual(
        expect.objectContaining({
          where: { sessionId: 'session-uuid-1' },
          update: expect.objectContaining({
            method: PaymentMethod.bank_qr,
            status: 'pending',
            paidAt: null,
          }),
        }),
      );
      expect(txCalls.sessionUpdate).toBeUndefined();
      expect(txCalls.slotUpdate).toBeUndefined();
      expect(result.session.status).toBe(SessionStatus.checkout_pending);
      expect(result.slot.status).toBe(SlotStatus.occupied);
      expect(result.payment.status).toBe('pending');
    });
  });

  describe('handlePayosWebhook', () => {
    it('rejects invalid signature/checksum', async () => {
      payos.verifyWebhook.mockImplementation(() => {
        throw new BadRequestException('Invalid PayOS webhook signature');
      });

      await expect(service.handlePayosWebhook({ signature: 'bad' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ignores unknown provider order safely', async () => {
      payos.verifyWebhook.mockReturnValue({
        orderCode: 999999,
        amount: 24000,
        success: true,
        reference: 'TF999',
        paymentLinkId: 'unknown',
      });
      prisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.handlePayosWebhook({ signature: 'ok' });

      expect(result).toEqual({ ok: true, ignored: true, reason: 'payment_not_found' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not mark paid when amount mismatches', async () => {
      payos.verifyWebhook.mockReturnValue({
        orderCode: 900001,
        amount: 1,
        success: true,
        reference: 'TF001',
        paymentLinkId: 'payos-link-1',
      });
      prisma.payment.findFirst.mockResolvedValue(makePayment({ amount: 24000 }));

      const result = await service.handlePayosWebhook({ signature: 'ok' });

      expect(result).toEqual({ ok: true, ignored: true, reason: 'amount_mismatch' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('marks pending bank_qr payment as paid, authorizes exit, and keeps slot occupied', async () => {
      payos.verifyWebhook.mockReturnValue({
        orderCode: 900001,
        amount: 24000,
        success: true,
        reference: 'TF001',
        paymentLinkId: 'payos-link-1',
        transactionDateTime: '2026-06-15 08:10:00',
      });
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({
          session: makeSession(),
        }),
      );

      let txCalls: { paymentUpdate?: unknown; sessionUpdate?: unknown; slotUpdate?: unknown } = {};
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.paymentUpdate = args;
              return Promise.resolve(makePayment({ status: 'paid', paidAt: new Date() }));
            }),
          },
          parkingSession: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.sessionUpdate = args;
              return Promise.resolve(makeSession({ status: SessionStatus.exit_authorized, isPaid: true }));
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.slotUpdate = args;
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.handlePayosWebhook({ signature: 'ok' });

      expect(txCalls.paymentUpdate).toEqual(
        expect.objectContaining({
          where: { id: 'payment-uuid-1' },
          data: expect.objectContaining({
            status: 'paid',
            method: PaymentMethod.bank_qr,
            paidAt: expect.any(Date),
          }),
        }),
      );
      expect(txCalls.sessionUpdate).toEqual(
        expect.objectContaining({
          where: { id: 'session-uuid-1' },
          data: expect.objectContaining({
            status: SessionStatus.exit_authorized,
            isPaid: true,
          }),
        }),
      );
      expect((txCalls.sessionUpdate as any).data).not.toHaveProperty('checkOutTime');
      expect(txCalls.slotUpdate).toBeUndefined();
      expect(result).toEqual({ ok: true, paid: true, sessionId: 'session-uuid-1' });
    });

    it('handles duplicate paid webhook idempotently', async () => {
      payos.verifyWebhook.mockReturnValue({
        orderCode: 900001,
        amount: 24000,
        success: true,
        reference: 'TF001',
        paymentLinkId: 'payos-link-1',
      });
      prisma.payment.findFirst.mockResolvedValue(
        makePayment({ status: 'paid', paidAt: new Date(), session: makeSession({ status: SessionStatus.exit_authorized }) }),
      );

      const result = await service.handlePayosWebhook({ signature: 'ok' });

      expect(result).toEqual({ ok: true, paid: true, idempotent: true, sessionId: 'session-uuid-1' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
