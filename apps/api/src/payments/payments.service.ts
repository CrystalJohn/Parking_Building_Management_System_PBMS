import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayService } from './vnpay.service';
import type { VerifiedVnpayCallback } from './vnpay.types';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpayService: VnpayService,
  ) {}

  /**
   * POST /sessions/:id/payments/bank-qr
   *
   * Creates a VNPAY payment URL for a checkout_pending session.
   * Idempotent: reuses an existing unexpired pending bank_qr payment if present.
   *
   * Business rules:
   * - Does NOT move session to exit_authorized.
   * - Does NOT release slot.
   * - Only checkout_pending sessions are eligible.
   */
  async createBankQrPayment(
    sessionId: string,
    staffUserId: string,
    ipAddr = '127.0.0.1',
  ) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
        payment: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    if ((session.status as string) === SessionStatus.completed) {
      throw new ConflictException(
        'Completed sessions cannot create Bank QR payment',
      );
    }

    if ((session.status as string) !== SessionStatus.checkout_pending) {
      throw new ConflictException(
        'Bank QR payment can only be created for checkout_pending sessions',
      );
    }

    const existingPayment = session.payment as any;
    if (
      existingPayment?.status === PaymentStatus.paid ||
      session.isPaid
    ) {
      throw new ConflictException('This session is already paid');
    }

    // Idempotent reuse of an unexpired pending VNPAY payment
    if (this.isReusablePendingBankQr(existingPayment)) {
      this.logger.log(
        `Reusing existing pending bank_qr payment | sessionId=${sessionId} paymentId=${existingPayment.id}`,
      );
      return this.formatPaymentWorkflow(session, existingPayment);
    }

    const amount =
      existingPayment?.amount ??
      Number(session.feeAmount) + Number(session.penaltyAmount);

    const paymentResult = this.vnpayService.createPaymentUrl({
      sessionId: session.id,
      sessionCode: session.sessionCode,
      licensePlate: session.licensePlate,
      amount,
      ipAddr,
    });

    this.logger.log(
      `VNPAY payment URL created | sessionId=${sessionId} txnRef=${paymentResult.providerOrderCode} amount=${amount}`,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      return (tx as any).payment.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          amount,
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          paidAt: null,
          receivedBy: null,
          provider: paymentResult.provider,
          providerRef: paymentResult.providerRef,
          providerOrderCode: paymentResult.providerOrderCode,
          checkoutUrl: paymentResult.checkoutUrl,
          qrCode: paymentResult.qrCode,
          expiredAt: paymentResult.expiredAt,
          providerPayload: paymentResult.providerPayload,
        },
        update: {
          amount,
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          paidAt: null,
          receivedBy: null,
          provider: paymentResult.provider,
          providerRef: paymentResult.providerRef,
          providerOrderCode: paymentResult.providerOrderCode,
          checkoutUrl: paymentResult.checkoutUrl,
          qrCode: paymentResult.qrCode,
          expiredAt: paymentResult.expiredAt,
          providerPayload: paymentResult.providerPayload,
        },
      });
    });

    return this.formatPaymentWorkflow(session, payment);
  }

  /**
   * GET /sessions/:id/payment-status
   * Returns current payment and session/slot state for the checkout polling loop.
   */
  async getPaymentStatus(sessionId: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
        payment: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    return this.formatPaymentWorkflow(session, (session as any).payment);
  }

  /**
   * VNPAY Return URL handler (GET /payments/vnpay/return).
   *
   * Called by VNPAY when customer completes/cancels on their payment page.
   * Business rules:
   * - Verifies signature before any state change.
   * - Amount must match.
   * - Success (00/00) → payment paid, session exit_authorized, slot stays occupied.
   * - Failure → update payment status, do NOT authorize exit.
   * - Idempotent: already-paid payments are a no-op.
   */
  async handleVnpayReturn(params: Record<string, string>) {
    return this.processVnpayCallback(params, 'return');
  }

  /**
   * VNPAY IPN handler (GET /payments/vnpay/ipn).
   *
   * Called server-to-server by VNPAY.
   * Same logic as return but must always return { RspCode, Message }.
   * Idempotent.
   */
  async handleVnpayIpn(params: Record<string, string>): Promise<{
    RspCode: string;
    Message: string;
  }> {
    try {
      await this.processVnpayCallback(params, 'ipn');
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`VNPAY IPN error: ${message}`);

      // Return specific VNPAY error codes
      if (message.includes('signature') || message.includes('SecureHash')) {
        return { RspCode: '97', Message: 'Invalid Checksum' };
      }
      if (message.includes('not found') || message.includes('txnRef')) {
        return { RspCode: '01', Message: 'Order Not Found' };
      }
      if (message.includes('Amount mismatch') || message.includes('amount mismatch') || message.includes('mismatch')) {
        return { RspCode: '04', Message: 'Invalid Amount' };
      }
      return { RspCode: '99', Message: 'Unknown Error' };
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async processVnpayCallback(
    params: Record<string, string>,
    source: 'return' | 'ipn',
  ) {
    // 1. Verify signature — throws on invalid
    let verified: VerifiedVnpayCallback;
    try {
      verified = this.vnpayService.verifyReturnOrIpn(params);
    } catch (err) {
      this.logger.warn(
        `VNPAY ${source} invalid signature | params=${JSON.stringify(params)}`,
      );
      throw err;
    }

    this.logger.log(
      `VNPAY ${source} | txnRef=${verified.txnRef} success=${verified.success} amount=${verified.amount}`,
    );

    // 2. Find payment by providerOrderCode (vnp_TxnRef)
    const payment = await (this.prisma as any).payment.findFirst({
      where: { providerOrderCode: verified.txnRef },
      include: {
        session: {
          select: { id: true, status: true, sessionCode: true, slotId: true, isPaid: true },
        },
      },
    });

    if (!payment) {
      this.logger.warn(
        `VNPAY ${source}: payment not found | txnRef=${verified.txnRef}`,
      );
      throw new NotFoundException(
        `Payment not found for txnRef: ${verified.txnRef}`,
      );
    }
    // 3. Amount validation
    if (Number(payment.amount) !== verified.amount) {
      this.logger.warn(
        `VNPAY ${source} amount mismatch | expected=${payment.amount} got=${verified.amount} txnRef=${verified.txnRef}`,
      );
      throw new ConflictException(
        `Amount mismatch: expected ${payment.amount}, got ${verified.amount}`,
      );
    }

    // 4. Idempotent — already paid
    if (payment.status === PaymentStatus.paid) {
      this.logger.log(
        `VNPAY ${source} duplicate (already paid) | txnRef=${verified.txnRef}`,
      );
      return {
        ok: true,
        paid: true,
        idempotent: true,
        sessionId: payment.sessionId,
        sessionCode: payment.session?.sessionCode ?? null,
      };
    }

    // 5a. Success path
    if (verified.success) {
      const paidAt = this.parseVnpayPayDate(verified.payDate) ?? new Date();

      await this.prisma.$transaction(async (tx) => {
        await (tx as any).payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.paid,
            method: PaymentMethod.bank_qr,
            paidAt,
            providerPayload: verified.rawParams,
          },
        });

        // Move session to exit_authorized — slot stays occupied
        await tx.parkingSession.update({
          where: { id: payment.sessionId },
          data: {
            status: SessionStatus.exit_authorized,
            isPaid: true,
            // checkOutTime is NOT set here — set only on confirm-exit
          } as any,
        });
        // Slot update intentionally omitted — only confirm-exit releases slot
      });

      this.logger.log(
        `VNPAY ${source} success | txnRef=${verified.txnRef} sessionId=${payment.sessionId} paidAt=${paidAt.toISOString()}`,
      );

      return { ok: true, paid: true, sessionId: payment.sessionId, sessionCode: payment.session?.sessionCode ?? null };
    }

    // 5b. Failure/cancel path — update payment status, do NOT touch session
    const failedStatus = this.mapFailedStatus(verified.responseCode);
    await (this.prisma as any).payment.update({
      where: { id: payment.id },
      data: {
        status: failedStatus,
        providerPayload: verified.rawParams,
      },
    });

    this.logger.log(
      `VNPAY ${source} not successful | txnRef=${verified.txnRef} responseCode=${verified.responseCode} paymentStatus=${failedStatus}`,
    );

    return {
      ok: true,
      paid: false,
      sessionId: payment.sessionId,
      sessionCode: payment.session?.sessionCode ?? null,
      reason: verified.responseCode,
    };
  }

  private mapFailedStatus(responseCode: string): PaymentStatus {
    // VNPAY response code mapping
    if (responseCode === '24') return PaymentStatus.cancelled; // Customer cancelled
    if (responseCode === '11') return PaymentStatus.expired;   // Payment expired
    return PaymentStatus.failed;
  }

  private parseVnpayPayDate(payDate: string | null): Date | null {
    if (!payDate) return null;
    // Format: yyyyMMddHHmmss (VNPAY, GMT+7)
    if (payDate.length === 14) {
      const year = payDate.slice(0, 4);
      const month = payDate.slice(4, 6);
      const day = payDate.slice(6, 8);
      const hour = payDate.slice(8, 10);
      const min = payDate.slice(10, 12);
      const sec = payDate.slice(12, 14);
      const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}+07:00`;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private isReusablePendingBankQr(payment: any): boolean {
    if (!payment) return false;
    if (payment.method !== PaymentMethod.bank_qr) return false;
    if (payment.status !== PaymentStatus.pending) return false;
    if (!payment.checkoutUrl && !payment.qrCode) return false;
    if (!payment.expiredAt) return true;
    return new Date(payment.expiredAt).getTime() > Date.now();
  }

  private formatPaymentWorkflow(session: any, payment: any) {
    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        status: session.status,
        isPaid: session.isPaid,
        feeAmount: session.feeAmount,
        penaltyAmount: session.penaltyAmount,
        isOvertime: session.isOvertime,
        isLostTicket: session.isLostTicket,
      },
      payment: payment
        ? {
            id: payment.id,
            sessionId: payment.sessionId,
            amount: payment.amount,
            method: payment.method,
            status: payment.status,
            paidAt: payment.paidAt,
            receivedBy: payment.receivedBy,
            checkoutUrl: payment.checkoutUrl,
            qrCode: payment.qrCode,
            expiredAt: payment.expiredAt,
          }
        : null,
      slot: {
        id: session.slot.id,
        code: session.slot.code,
        status: session.slot.status,
        zone: session.slot.zone,
        floor: session.slot.floor
          ? {
              id: session.slot.floor.id,
              floorNumber: session.slot.floor.floorNumber,
              name: session.slot.floor.name,
            }
          : undefined,
      },
    };
  }
}
