import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentMethod, SessionStatus, SlotStatus, VehicleType, Zone } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayService } from './vnpay.service';
import { PaymentsService } from './payments.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeFloor = () => ({ id: 1, floorNumber: 1, name: 'T1' });

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
  sessionCode: 'PBMS-SESSION01',
  licensePlate: '59A-12345',
  vehicleType: VehicleType.car,
  checkInTime: new Date('2026-06-15T08:00:00Z'),
  checkOutTime: null,
  status: SessionStatus.checkout_pending,
  feeAmount: 60000,
  penaltyAmount: 0,
  isPaid: false,
  slotId: 1,
  slot: makeSlot(),
  payment: null,
  ...overrides,
});

const makeVnpayPayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-uuid-1',
  sessionId: 'session-uuid-1',
  amount: 60000,
  method: PaymentMethod.bank_qr,
  status: 'pending',
  paidAt: null,
  receivedBy: null,
  provider: 'vnpay',
  providerRef: null,
  providerOrderCode: 'PBMSSESSION0011718430000123',
  checkoutUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=PBMS',
  qrCode: null,
  expiredAt: new Date(Date.now() + 10 * 60 * 1000),
  providerPayload: { vnp_TxnRef: 'PBMSSESSION0011718430000123' },
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PaymentsService — VNPAY migration', () => {
  let service: PaymentsService;
  let prisma: {
    parkingSession: { findUnique: jest.Mock; update: jest.Mock };
    payment: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let vnpay: {
    createPaymentUrl: jest.Mock;
    verifyReturnOrIpn: jest.Mock;
    isConfigured: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      parkingSession: { findUnique: jest.fn(), update: jest.fn() },
      payment: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };

    vnpay = {
      createPaymentUrl: jest.fn(),
      verifyReturnOrIpn: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    };

    service = new PaymentsService(
      prisma as unknown as PrismaService,
      vnpay as unknown as VnpayService,
    );
  });

  // ─── createBankQrPayment ─────────────────────────────────────────────────

  describe('createBankQrPayment', () => {
    it('rejects non-existent session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(null);

      await expect(service.createBankQrPayment('missing', 'staff-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects active session before checkout_pending', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ status: SessionStatus.active }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects completed session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ status: SessionStatus.completed, isPaid: true }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects already paid session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({
          isPaid: true,
          payment: makeVnpayPayment({ status: 'paid', paidAt: new Date() }),
        }),
      );

      await expect(service.createBankQrPayment('session-uuid-1', 'staff')).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns existing pending unexpired VNPAY payment idempotently', async () => {
      const payment = makeVnpayPayment();
      prisma.parkingSession.findUnique.mockResolvedValue(makeSession({ payment }));

      const result = await service.createBankQrPayment('session-uuid-1', 'staff');

      expect(vnpay.createPaymentUrl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.payment?.id).toBe('payment-uuid-1');
      expect(result.payment?.method).toBe(PaymentMethod.bank_qr);
      expect(result.session.status).toBe(SessionStatus.checkout_pending);
      expect(result.slot.status).toBe(SlotStatus.occupied);
    });

    it('creates VNPAY payment URL and stores provider=vnpay, does NOT change session/slot', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(makeSession());
      vnpay.createPaymentUrl.mockReturnValue({
        provider: 'vnpay',
        providerRef: null,
        providerOrderCode: 'PBMS12345678',
        checkoutUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=PBMS12345678',
        qrCode: null,
        expiredAt: new Date(Date.now() + 15 * 60 * 1000),
        providerPayload: { vnp_TxnRef: 'PBMS12345678' },
      });

      let txCalls: { upsertArgs?: unknown; sessionUpdate?: unknown; slotUpdate?: unknown } = {};
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            upsert: jest.fn().mockImplementation((args: unknown) => {
              txCalls.upsertArgs = args;
              return Promise.resolve(makeVnpayPayment({ providerOrderCode: 'PBMS12345678' }));
            }),
          },
          parkingSession: {
            update: jest.fn().mockImplementation((args: unknown) => {
              txCalls.sessionUpdate = args;
              return Promise.resolve({});
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args: unknown) => {
              txCalls.slotUpdate = args;
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.createBankQrPayment('session-uuid-1', 'staff', '10.0.0.1');

      // VnpayService must be called with correct input
      expect(vnpay.createPaymentUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: 'session',
          referenceId: 'session-uuid-1',
          referenceCode: 'PBMS-SESSION01',
          amount: 60000,
          ipAddr: '10.0.0.1',
        }),
      );

      // Payment upsert must store provider=vnpay and method=bank_qr
      expect(txCalls.upsertArgs).toEqual(
        expect.objectContaining({
          where: { sessionId: 'session-uuid-1' },
          create: expect.objectContaining({
            provider: 'vnpay',
            method: PaymentMethod.bank_qr,
            status: 'pending',
            paidAt: null,
          }),
          update: expect.objectContaining({
            provider: 'vnpay',
            method: PaymentMethod.bank_qr,
            status: 'pending',
          }),
        }),
      );

      // Session and slot must NOT be updated during URL creation
      expect(txCalls.sessionUpdate).toBeUndefined();
      expect(txCalls.slotUpdate).toBeUndefined();

      expect(result.session.status).toBe(SessionStatus.checkout_pending);
      expect(result.slot.status).toBe(SlotStatus.occupied);
      expect(result.payment?.status).toBe('pending');
    });

    it('uses correct HMAC-SHA512 signing via VnpayService', () => {
      // Unit test signing logic directly on VnpayService
      const svc = new VnpayService();
      // Patch env for this test
      process.env.VNPAY_TMN_CODE = 'TESTCODE';
      process.env.VNPAY_HASH_SECRET = 'testsecret';
      process.env.VNPAY_PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
      process.env.VNPAY_RETURN_URL = 'http://localhost:5173/staff/gate';

      const result = svc.createPaymentUrl({
        referenceType: 'session',
        referenceId: 'sess-1',
        referenceCode: 'PBMS-SESS01',
        description: 'PBMS checkout',
        amount: 10000,
        ipAddr: '127.0.0.1',
      });

      expect(result.checkoutUrl).toContain('vnp_SecureHash=');
      expect(result.checkoutUrl).toContain('vnp_TmnCode=TESTCODE');
      expect(result.checkoutUrl).toContain('vnp_Amount=1000000'); // 10000 * 100
      expect(result.providerPayload.vnp_Amount).toBe('1000000');
      expect(result.provider).toBe('vnpay');
      expect(result.qrCode).toBeNull();
    });
  });

  describe('driver self-pay', () => {
    it('rejects driver payment for another driver session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({ driverId: 'driver-a', payment: null }),
      );

      await expect(
        service.createDriverBankQrPayment('session-uuid-1', 'driver-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns payment status for the owning driver', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({
          driverId: 'driver-a',
          payment: makeVnpayPayment({ status: 'pending' }),
        }),
      );

      const result = await service.getPaymentStatusForDriver('session-uuid-1', 'driver-a');

      expect(result.session.id).toBe('session-uuid-1');
      expect(result.payment?.status).toBe('pending');
    });
  });

  // ─── handleVnpayReturn / handleVnpayIpn ─────────────────────────────────

  describe('handleVnpayReturn', () => {
    it('rejects invalid signature', async () => {
      vnpay.verifyReturnOrIpn.mockImplementation(() => {
        throw new BadRequestException('Invalid VNPAY signature');
      });

      await expect(
        service.handleVnpayReturn({ vnp_SecureHash: 'bad' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown txnRef', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'UNKNOWN',
        amount: 60000,
        success: true,
        responseCode: '00',
        transactionStatus: '00',
        payDate: null,
        bankCode: null,
        rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.handleVnpayReturn({})).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException on amount mismatch — does NOT mark paid', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'PBMS12345678',
        amount: 1, // wrong
        success: true,
        responseCode: '00',
        transactionStatus: '00',
        payDate: null,
        bankCode: null,
        rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(
        makeVnpayPayment({ providerOrderCode: 'PBMS12345678', session: makeSession() }),
      );

      await expect(service.handleVnpayReturn({})).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('marks payment paid, moves session to exit_authorized, keeps slot occupied', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'PBMS12345678',
        amount: 60000,
        success: true,
        responseCode: '00',
        transactionStatus: '00',
        payDate: '20260615081000',
        bankCode: 'NCB',
        rawParams: { vnp_TxnRef: 'PBMS12345678' },
      });
      prisma.payment.findFirst.mockResolvedValue(
        makeVnpayPayment({
          providerOrderCode: 'PBMS12345678',
          session: makeSession(),
        }),
      );

      let txCalls: { paymentUpdate?: unknown; sessionUpdate?: unknown; slotUpdate?: unknown } = {};
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            update: jest.fn().mockImplementation((args: unknown) => {
              txCalls.paymentUpdate = args;
              return Promise.resolve(makeVnpayPayment({ status: 'paid', paidAt: new Date() }));
            }),
          },
          parkingSession: {
            update: jest.fn().mockImplementation((args: unknown) => {
              txCalls.sessionUpdate = args;
              return Promise.resolve(makeSession({ status: SessionStatus.exit_authorized, isPaid: true }));
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args: unknown) => {
              txCalls.slotUpdate = args;
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.handleVnpayReturn({});

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
      // checkOutTime must NOT be set here
      expect((txCalls.sessionUpdate as any)?.data).not.toHaveProperty('checkOutTime');
      // Slot must NOT be updated (not released)
      expect(txCalls.slotUpdate).toBeUndefined();
      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          paid: true,
          sessionId: 'session-uuid-1',
        }),
      );
    });

    it('failed response does NOT authorize exit', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'PBMS12345678',
        amount: 60000,
        success: false,
        responseCode: '24', // Customer cancelled
        transactionStatus: '02',
        payDate: null,
        bankCode: null,
        rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(
        makeVnpayPayment({ providerOrderCode: 'PBMS12345678', session: makeSession() }),
      );
      prisma.payment.update = jest.fn().mockResolvedValue({});
      (prisma as any).payment.update = prisma.payment.update;

      const result = await service.handleVnpayReturn({});

      expect(result.paid).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled(); // No lifecycle change
    });
  });

  describe('handleVnpayIpn', () => {
    it('handles duplicate paid IPN idempotently', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'PBMS12345678',
        amount: 60000,
        success: true,
        responseCode: '00',
        transactionStatus: '00',
        payDate: null,
        bankCode: null,
        rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(
        makeVnpayPayment({
          status: 'paid',
          paidAt: new Date(),
          session: makeSession({ status: SessionStatus.exit_authorized }),
        }),
      );

      const result = await service.handleVnpayIpn({});

      expect(result.RspCode).toBe('00');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns RspCode 97 for invalid signature', async () => {
      vnpay.verifyReturnOrIpn.mockImplementation(() => {
        throw new BadRequestException('Invalid VNPAY signature');
      });

      const result = await service.handleVnpayIpn({ vnp_SecureHash: 'bad' });

      expect(result.RspCode).toBe('97');
    });

    it('returns RspCode 01 for unknown txnRef', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'UNKNOWN', amount: 60000, success: true,
        responseCode: '00', transactionStatus: '00',
        payDate: null, bankCode: null, rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.handleVnpayIpn({});

      expect(result.RspCode).toBe('01');
    });

    it('returns RspCode 04 for amount mismatch', async () => {
      vnpay.verifyReturnOrIpn.mockReturnValue({
        txnRef: 'PBMS12345678', amount: 1, success: true,
        responseCode: '00', transactionStatus: '00',
        payDate: null, bankCode: null, rawParams: {},
      });
      prisma.payment.findFirst.mockResolvedValue(
        makeVnpayPayment({ session: makeSession() }),
      );

      const result = await service.handleVnpayIpn({});

      expect(result.RspCode).toBe('04');
    });
  });

  // ─── Cash checkout regression ─────────────────────────────────────────────

  describe('cash checkout regression', () => {
    it('getPaymentStatus returns session/slot/payment for any session', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(
        makeSession({
          status: SessionStatus.exit_authorized,
          isPaid: true,
          payment: makeVnpayPayment({ status: 'paid', paidAt: new Date() }),
        }),
      );

      const result = await service.getPaymentStatus('session-uuid-1');

      expect(result.session.status).toBe(SessionStatus.exit_authorized);
      expect(result.payment?.status).toBe('paid');
      expect(result.slot.status).toBe(SlotStatus.occupied);
    });
  });
});
