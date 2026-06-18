import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayosService } from './payos.service';
import { VerifiedPayosWebhook } from './payos.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payosService: PayosService,
  ) {}

  async createBankQrPayment(sessionId: string, _staffUserId: string) {
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
      throw new ConflictException('Completed sessions cannot create Bank QR payment');
    }

    if ((session.status as string) !== SessionStatus.checkout_pending) {
      throw new ConflictException(
        'Bank QR payment can only be created for checkout_pending sessions',
      );
    }

    if (session.isPaid || (session.payment as any)?.status === PaymentStatus.paid) {
      throw new ConflictException('This session is already paid');
    }

    const existingPayment = session.payment as any;
    if (this.isReusablePendingBankQr(existingPayment)) {
      return this.formatPaymentWorkflow(session, existingPayment);
    }

    const amount =
      existingPayment?.amount ?? Number(session.feeAmount) + Number(session.penaltyAmount);

    const paymentLink = await this.payosService.createPaymentLink({
      sessionId: session.id,
      sessionCode: session.sessionCode,
      licensePlate: session.licensePlate,
      amount,
    });

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
          provider: paymentLink.provider,
          providerRef: paymentLink.providerRef,
          providerOrderCode: paymentLink.providerOrderCode,
          checkoutUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          expiredAt: paymentLink.expiredAt,
          providerPayload: paymentLink.providerPayload,
        },
        update: {
          amount,
          method: PaymentMethod.bank_qr,
          status: PaymentStatus.pending,
          paidAt: null,
          receivedBy: null,
          provider: paymentLink.provider,
          providerRef: paymentLink.providerRef,
          providerOrderCode: paymentLink.providerOrderCode,
          checkoutUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode,
          expiredAt: paymentLink.expiredAt,
          providerPayload: paymentLink.providerPayload,
        },
      });
    });

    return this.formatPaymentWorkflow(session, payment);
  }

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

  async handlePayosWebhook(payload: unknown) {
    const verified = this.payosService.verifyWebhook(payload);

    const payment = await (this.prisma as any).payment.findFirst({
      where: {
        OR: [
          { providerOrderCode: verified.orderCode },
          { providerRef: verified.paymentLinkId },
          { providerRef: verified.reference },
        ],
      },
      include: {
        session: {
          include: {
            slot: true,
          },
        },
      },
    });

    if (!payment) {
      return { ok: true, ignored: true, reason: 'payment_not_found' };
    }

    if (Number(payment.amount) !== Number(verified.amount)) {
      return { ok: true, ignored: true, reason: 'amount_mismatch' };
    }

    if (payment.status === PaymentStatus.paid) {
      return {
        ok: true,
        paid: true,
        idempotent: true,
        sessionId: payment.sessionId,
      };
    }

    if (!verified.success) {
      return { ok: true, ignored: true, reason: 'not_paid' };
    }

    const paidAt = this.parsePayosPaidAt(verified) ?? new Date();

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.paid,
          method: PaymentMethod.bank_qr,
          paidAt,
          providerPayload: verified.rawData,
        },
      });

      await tx.parkingSession.update({
        where: { id: payment.sessionId },
        data: {
          status: SessionStatus.exit_authorized,
          isPaid: true,
        } as any,
      });
    });

    return { ok: true, paid: true, sessionId: payment.sessionId };
  }

  private isReusablePendingBankQr(payment: any) {
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

  private parsePayosPaidAt(verified: VerifiedPayosWebhook) {
    if (!verified.transactionDateTime) return null;
    const parsed = new Date(
      verified.transactionDateTime.replace(' ', 'T') + '+07:00',
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
