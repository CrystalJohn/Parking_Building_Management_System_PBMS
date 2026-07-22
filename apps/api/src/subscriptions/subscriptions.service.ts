import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayService } from '../payments/vnpay.service';
import { CreateSubscriptionDto } from './dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpayService: VnpayService,
  ) {}

  async create(dto: CreateSubscriptionDto, driverId: string, ipAddr: string) {
    // 1. Verify driver owns the vehicle
    const vehicleUser = await this.prisma.vehicleUser.findUnique({
      where: {
        vehicleId_userId: { vehicleId: dto.vehicleId, userId: driverId },
      },
      include: {
        vehicle: { select: { id: true, vehicleType: true, plateNumber: true } },
      },
    });
    if (!vehicleUser) {
      throw new NotFoundException('Vehicle not found or not owned by you');
    }

    const vehicle = vehicleUser.vehicle;

    // 2. Check no active/pending subscription exists for this vehicle
    const existing = await this.prisma.subscription.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: { in: ['pending', 'active'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Vehicle already has a ${existing.status} subscription`,
      );
    }

    // 3. Get pricing
    const pricing = await this.prisma.pricingConfig.findFirst({
      where: { vehicleType: vehicle.vehicleType },
    });
    if (!pricing) {
      throw new NotFoundException(`Pricing config not found for ${vehicle.vehicleType}`);
    }

    const amount =
      dto.planType === 'monthly' ? pricing.monthlyRate : pricing.yearlyRate;

    // 4. Create subscription + payment + VNPAY URL in a transaction
    return this.prisma.$transaction(async (tx: any) => {
      const subscription = await tx.subscription.create({
        data: {
          vehicleId: vehicle.id,
          planType: dto.planType,
          status: 'pending',
          createdById: driverId,
        },
      });

      const paymentResult = this.vnpayService.createPaymentUrl({
        referenceType: 'subscription',
        referenceId: subscription.id,
        referenceCode: subscription.id,
        description: `PBMS ${dto.planType} subscription`,
        amount,
        ipAddr,
      });

      const payment = await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount,
          method: 'bank_qr',
          status: 'pending',
          provider: paymentResult.provider,
          providerRef: paymentResult.providerRef,
          providerOrderCode: paymentResult.providerOrderCode,
          checkoutUrl: paymentResult.checkoutUrl,
          qrCode: paymentResult.qrCode,
          expiredAt: paymentResult.expiredAt,
          providerPayload: paymentResult.providerPayload,
        },
      });

      this.logger.log(
        `Subscription created | id=${subscription.id} vehicle=${vehicle.plateNumber} plan=${dto.planType} amount=${amount}`,
      );

      return {
        id: subscription.id,
        vehicleId: vehicle.id,
        vehicleType: vehicle.vehicleType,
        plateNumber: vehicle.plateNumber,
        planType: dto.planType,
        amount,
        checkoutUrl: paymentResult.checkoutUrl,
        qrCode: paymentResult.qrCode,
        expiredAt: paymentResult.expiredAt,
        paymentId: payment.id,
        paymentStatus: payment.status,
      };
    });
  }

  async findMySubscriptions(driverId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        vehicle: {
          vehicleUsers: {
            some: { userId: driverId },
          },
        },
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
        payment: { select: { id: true, status: true, amount: true, method: true, paidAt: true, checkoutUrl: true, expiredAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions.map((sub) => ({
      id: sub.id,
      vehicleId: sub.vehicleId,
      plateNumber: sub.vehicle.plateNumber,
      vehicleType: sub.vehicle.vehicleType,
      planType: sub.planType,
      status: sub.status,
      validFrom: sub.validFrom,
      validTo: sub.validTo,
      notes: sub.notes,
      payment: sub.payment,
      createdAt: sub.createdAt,
    }));
  }

  async getPaymentStatus(subscriptionId: string, driverId: string) {
    const subscription = await (this.prisma as any).subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        vehicle: {
          include: {
            vehicleUsers: {
              where: { userId: driverId },
              select: { userId: true },
            },
          },
        },
        payment: { select: { status: true, paidAt: true, method: true, amount: true, checkoutUrl: true, expiredAt: true } },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    if (subscription.vehicle.vehicleUsers.length === 0) {
      throw new NotFoundException('Subscription not found');
    }

    return {
      id: subscription.id,
      planType: subscription.planType,
      status: subscription.status,
      validFrom: subscription.validFrom,
      validTo: subscription.validTo,
      payment: subscription.payment,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredPendingSubscriptions() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const result = await this.prisma.subscription.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      data: { status: 'cancelled' },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-cancelled ${result.count} expired pending subscriptions`);
    }
  }
}
