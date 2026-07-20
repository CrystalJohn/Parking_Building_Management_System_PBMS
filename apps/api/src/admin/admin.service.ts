import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  SessionStatus,
  SlotStatus,
  VehicleType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminOperationsFlagsDto, AdminOperationFlagDto } from './dto/admin-flags.dto';
import type {
  AdminPendingPaymentItemDto,
  AdminPendingPaymentsDto,
  PaymentMonitoringRisk,
} from './dto/admin-pending-payments.dto';
import type {
  AdminReservationAuditDto,
  AdminReservationAuditItemDto,
} from './dto/admin-reservation-audit.dto';
import type {
  AdminSessionEvidenceDto,
  AdminSessionEvidenceItemDto,
} from './dto/admin-session-evidence.dto';
import type {
  AdminSessionHistoryDto,
  AdminSessionHistoryItemDto,
} from './dto/admin-session-history.dto';
import type {
  AdminSummaryDto,
  FloorSlotMetricDto,
  SlotSummaryDto,
  SlotMetricDto,
  ZoneSlotMetricDto,
} from './dto/admin-summary.dto';
import type {
  AdminSlotOccupancyMapDto,
  SlotOccupancyMapFloorDto,
  SlotOccupancyMapZoneDto,
  SlotOccupancyMapSlotDto,
  SlotOccupancyMapRiskDto,
  SlotOccupancyMapRiskLevel,
} from './dto/admin-slot-occupancy-map.dto';

const FLAG_THRESHOLDS = {
  longActiveSessionHours: 24,
  checkoutPendingMinutes: 10,
  exitAuthorizedMinutes: 10,
  pendingBankQrMinutes: 15,
  warningActiveHours: 12,
} as const;

/** Thresholds exposed on the slot-occupancy-map response (plan spec: checkoutPendingMinutes = 30) */
const MAP_THRESHOLDS = {
  longActiveSessionHours: 24,
  checkoutPendingMinutes: 30,
  exitAuthorizedMinutes: 10,
  pendingBankQrMinutes: 15,
  warningActiveHours: 12,
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(now = new Date()): Promise<AdminSummaryDto> {
    const today = getHoChiMinhDayRange(now);

    const [slots, sessions, reservations, payments] = await Promise.all([
      this.prisma.slot.findMany({
        select: {
          status: true,
          vehicleType: true,
          zone: true,
          floor: { select: { floorNumber: true, name: true } },
        },
      }),
      this.prisma.parkingSession.findMany({
        select: {
          status: true,
          checkInTime: true,
          checkOutTime: true,
          reservationId: true,
        },
      }),
      this.prisma.reservation.findMany({
        select: {
          status: true,
          createdAt: true,
          expiresAt: true,
          session: {
            select: {
              checkInTime: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        select: {
          amount: true,
          method: true,
          status: true,
          paidAt: true,
          provider: true,
          expiredAt: true,
        },
      }),
    ]);

    const reportDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
    const activeSessions = sessions.filter((s) => s.status === SessionStatus.active).length;
    const checkoutPending = sessions.filter((s) => s.status === SessionStatus.checkout_pending).length;
    const exitAuthorized = sessions.filter((s) => s.status === SessionStatus.exit_authorized).length;
    const paidPayments = payments.filter(
      (p) => p.status === PaymentStatus.paid && isWithinRange(p.paidAt, today.start, today.end),
    );

    return {
      meta: {
        selectedDate: reportDate,
        timezone: 'Asia/Ho_Chi_Minh',
        range: {
          start: today.start.toISOString(),
          end: today.end.toISOString(),
        },
      },
      todayStatus: {
        slots: buildSlotSummary(slots),
        openSessions: {
          active: activeSessions,
          checkoutPending,
          exitAuthorized,
          total: activeSessions + checkoutPending + exitAuthorized,
        },
        pendingPayments: payments.filter((p) => p.status === PaymentStatus.pending).length,
        paymentRisk: buildPaymentRiskSummary(payments, now),
      },
      report: {
        checkIns: sessions.filter((s) => isWithinRange(s.checkInTime, today.start, today.end)).length,
        checkOuts: sessions.filter((s) => isWithinRange(s.checkOutTime, today.start, today.end)).length,
        completedSessions: sessions.filter(
          (s) => s.status === SessionStatus.completed && isWithinRange(s.checkOutTime, today.start, today.end),
        ).length,
        paidPayments: paidPayments.length,
        revenue: sumAmount(paidPayments),
        revenueByMethod: {
          cash: sumAmount(paidPayments.filter((p) => p.method === PaymentMethod.cash)),
          bankQr: sumAmount(paidPayments.filter((p) => p.method === PaymentMethod.bank_qr)),
        },
        revenueByProvider: {
          vnpay: sumAmount(
            paidPayments.filter((p) => (p.provider ?? '').toLowerCase() === 'vnpay'),
          ),
        },
        reservationCheckIns: reservations.filter((r) =>
          isWithinRange(r.session?.checkInTime, today.start, today.end),
        ).length,
        expiredReservations: reservations.filter((r) =>
          isWithinRange(r.expiresAt, today.start, today.end),
        ).length,
      },
    };
  }

  async getOperationsFlags(now = new Date()): Promise<AdminOperationsFlagsDto> {
    const today = getHoChiMinhDayRange(now);
    const flags: AdminOperationFlagDto[] = [];

    const [sessions, payments, expiredReservations] = await Promise.all([
      this.prisma.parkingSession.findMany({
        where: {
          status: {
            in: [
              SessionStatus.active,
              SessionStatus.checkout_pending,
              SessionStatus.exit_authorized,
            ],
          },
        },
        select: {
          id: true,
          sessionCode: true,
          licensePlate: true,
          status: true,
          checkInTime: true,
          payment: {
            select: {
              id: true,
              method: true,
              status: true,
              paidAt: true,
              expiredAt: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: { in: [PaymentStatus.pending, PaymentStatus.failed] },
        },
        select: {
          id: true,
          method: true,
          status: true,
          paidAt: true,
          expiredAt: true,
          session: {
            select: {
              id: true,
              sessionCode: true,
              licensePlate: true,
              checkInTime: true,
            },
          },
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.expired,
          OR: [
            { expiresAt: { gte: today.start, lt: today.end } },
            { createdAt: { gte: today.start, lt: today.end } },
          ],
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          session: {
            select: {
              id: true,
              sessionCode: true,
              licensePlate: true,
            },
          },
        },
      }),
    ]);

    for (const session of sessions) {
      if (session.status === SessionStatus.active) {
        const ageMinutes = diffMinutes(now, session.checkInTime);
        if (ageMinutes > FLAG_THRESHOLDS.longActiveSessionHours * 60) {
          flags.push(
            buildFlag({
              type: 'long_active_session',
              severity: 'warning',
              sessionId: session.id,
              sessionCode: session.sessionCode,
              plateNumber: session.licensePlate,
              createdAt: session.checkInTime,
              ageMinutes,
              message: 'Vehicle has been active for more than 24 hours.',
            }),
          );
        }
      }

      if (session.status === SessionStatus.checkout_pending) {
        // Payment.createdAt and ParkingSession.updatedAt do not exist in the
        // current schema. For VNPAY links, expiredAt - 15 minutes approximates
        // creation time; otherwise fall back to checkInTime.
        const anchor =
          session.payment?.expiredAt && session.payment.method === PaymentMethod.bank_qr
            ? new Date(
                session.payment.expiredAt.getTime() -
                  FLAG_THRESHOLDS.pendingBankQrMinutes * 60 * 1000,
              )
            : session.checkInTime;
        const ageMinutes = diffMinutes(now, anchor);
        if (ageMinutes > FLAG_THRESHOLDS.checkoutPendingMinutes) {
          flags.push(
            buildFlag({
              type: 'checkout_pending_too_long',
              severity: 'warning',
              sessionId: session.id,
              sessionCode: session.sessionCode,
              paymentId: session.payment?.id ?? null,
              plateNumber: session.licensePlate,
              createdAt: anchor,
              ageMinutes,
              message: 'Checkout has been pending for more than 10 minutes.',
            }),
          );
        }
      }

      if (session.status === SessionStatus.exit_authorized) {
        const anchor = session.payment?.paidAt ?? session.checkInTime;
        const ageMinutes = diffMinutes(now, anchor);
        if (ageMinutes > FLAG_THRESHOLDS.exitAuthorizedMinutes) {
          flags.push(
            buildFlag({
              type: 'exit_authorized_not_exited',
              severity: 'critical',
              sessionId: session.id,
              sessionCode: session.sessionCode,
              paymentId: session.payment?.id ?? null,
              plateNumber: session.licensePlate,
              createdAt: anchor,
              ageMinutes,
              message: 'Payment completed but vehicle has not exited after 10 minutes.',
            }),
          );
        }
      }
    }

    for (const payment of payments) {
      if (
        payment.status === PaymentStatus.pending &&
        payment.method === PaymentMethod.bank_qr
      ) {
        // Payment.createdAt does not exist yet. VNPAY expiredAt is generated as
        // create time + 15 minutes, so expiredAt <= now means the pending QR is
        // older than the Phase 1 threshold.
        const anchor =
          payment.expiredAt
            ? new Date(
                payment.expiredAt.getTime() -
                  FLAG_THRESHOLDS.pendingBankQrMinutes * 60 * 1000,
              )
            : payment.session.checkInTime;
        const ageMinutes = diffMinutes(now, anchor);
        if (ageMinutes > FLAG_THRESHOLDS.pendingBankQrMinutes) {
          flags.push(
            buildFlag({
              type: 'pending_bank_qr_too_long',
              severity: 'warning',
              sessionId: payment.session.id,
              sessionCode: payment.session.sessionCode,
              paymentId: payment.id,
              plateNumber: payment.session.licensePlate,
              createdAt: anchor,
              ageMinutes,
              message: 'Bank QR payment has been pending for more than 15 minutes.',
            }),
          );
        }
      }

      if (payment.status === PaymentStatus.failed) {
        const anchor = payment.expiredAt ?? payment.paidAt ?? payment.session.checkInTime;
        flags.push(
          buildFlag({
            type: 'failed_payment',
            severity: 'warning',
            sessionId: payment.session.id,
            sessionCode: payment.session.sessionCode,
            paymentId: payment.id,
            plateNumber: payment.session.licensePlate,
            createdAt: anchor,
            ageMinutes: diffMinutes(now, anchor),
            message: 'Payment failed and may require staff review.',
          }),
        );
      }
    }

    for (const reservation of expiredReservations) {
      const anchor = reservation.expiresAt ?? reservation.createdAt;
      flags.push(
        buildFlag({
          type: 'expired_reservation',
          severity: 'info',
          sessionId: reservation.session?.id ?? null,
          sessionCode: reservation.session?.sessionCode ?? null,
          reservationCode: null,
          plateNumber: reservation.session?.licensePlate ?? null,
          createdAt: anchor,
          ageMinutes: diffMinutes(now, anchor),
          message: 'Reservation expired today.',
        }),
      );
    }

    const sortedFlags = flags
      .sort((a, b) => {
        const severityDiff = severityRank(a.severity) - severityRank(b.severity);
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 50);

    return {
      summary: {
        totalFlags: sortedFlags.length,
        critical: sortedFlags.filter((f) => f.severity === 'critical').length,
        warning: sortedFlags.filter((f) => f.severity === 'warning').length,
        info: sortedFlags.filter((f) => f.severity === 'info').length,
      },
      thresholds: FLAG_THRESHOLDS,
      flags: sortedFlags,
    };
  }

  async getPendingPayments(now = new Date()): Promise<AdminPendingPaymentsDto> {
    const payments = await this.prisma.payment.findMany({
      where: {
        OR: [
          { status: PaymentStatus.pending },
          {
            status: PaymentStatus.paid,
            session: {
              status: {
                notIn: [SessionStatus.exit_authorized, SessionStatus.completed],
              },
            },
          },
        ],
      },
      select: {
        id: true,
        amount: true,
        method: true,
        provider: true,
        status: true,
        paidAt: true,
        expiredAt: true,
        receivedUser: {
          select: { id: true, fullName: true, phone: true },
        },
        session: {
          select: {
            sessionCode: true,
            licensePlate: true,
            status: true,
            checkInTime: true,
            checkedInBy: {
              select: { id: true, fullName: true, phone: true },
            },
            checkedOutBy: {
              select: { id: true, fullName: true, phone: true },
            },
            slot: {
              select: {
                code: true,
                zone: true,
                floor: { select: { floorNumber: true, name: true } },
              },
            },
          },
        },
      },
    });

    const items = payments
      .map((payment): AdminPendingPaymentItemDto => {
        const createdAt = getPaymentMonitoringAnchor(payment, now);
        const ageMinutes = diffMinutes(now, createdAt);
        const decision = classifyPaymentMonitoringItem(payment, ageMinutes);
        const slotCode = payment.session?.slot?.code ?? null;
        const floor =
          payment.session?.slot?.floor?.name ??
          payment.session?.slot?.floor?.floorNumber ??
          null;
        const zone = payment.session?.slot?.zone ?? null;

        return {
          paymentId: payment.id,
          sessionCode: payment.session?.sessionCode ?? null,
          plateNumber: payment.session?.licensePlate ?? null,
          responsibleStaff: resolveResponsibleStaff(payment),
          amount: Number(payment.amount || 0),
          method: payment.method,
          provider: payment.provider ?? null,
          status: payment.status,
          sessionStatus: payment.session?.status ?? null,
          slotCode,
          floor,
          zone,
          waitingLabel: formatWaitingLabel(ageMinutes, payment, decision.risk),
          locationLabel: formatLocationLabel(slotCode, floor, zone),
          createdAt: createdAt.toISOString(),
          ageMinutes,
          risk: decision.risk,
          reason: decision.reason,
          recommendedAction: decision.recommendedAction,
        };
      })
      .sort((a, b) => {
        const riskDiff = paymentRiskRank(a.risk) - paymentRiskRank(b.risk);
        if (riskDiff !== 0) return riskDiff;
        return b.ageMinutes - a.ageMinutes;
      })
      .slice(0, 50);

    return {
      summary: {
        total: items.length,
        normal: items.filter((item) => item.risk === 'normal').length,
        warning: items.filter((item) => item.risk === 'warning').length,
        critical: items.filter((item) => item.risk === 'critical').length,
        overdue: items.filter((item) => item.risk === 'warning' || item.risk === 'critical').length,
      },
      thresholds: {
        pendingBankQrMinutes: FLAG_THRESHOLDS.pendingBankQrMinutes,
      },
      items,
    };
  }

  async getReservationAudit(now = new Date()): Promise<AdminReservationAuditDto> {
    const today = getHoChiMinhDayRange(now);
    const soonThreshold = new Date(now.getTime() + 5 * 60 * 1000);

    const [activeReserved, expiredToday, fulfilledToday] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.active,
          slot: { status: SlotStatus.reserved },
        },
        include: reservationAuditInclude,
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.expired,
          expiresAt: { gte: today.start, lt: today.end },
        },
        include: reservationAuditInclude,
        orderBy: { expiresAt: 'desc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          status: ReservationStatus.fulfilled,
          session: {
            checkInTime: { gte: today.start, lt: today.end },
          },
        },
        include: reservationAuditInclude,
        orderBy: { session: { checkInTime: 'desc' } },
      }),
    ]);

    const expiringSoon = activeReserved.filter((reservation) => {
      if (!reservation.expiresAt) return false;
      return reservation.expiresAt.getTime() > now.getTime() && reservation.expiresAt.getTime() <= soonThreshold.getTime();
    });

    const watchlist = buildReservationWatchlist({
      now,
      activeReserved,
      expiredToday,
      fulfilledToday,
    });

    const reportDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);

    return {
      meta: {
        selectedDate: reportDate,
        timezone: 'Asia/Ho_Chi_Minh',
        range: {
          start: today.start.toISOString(),
          end: today.end.toISOString(),
        },
      },
      summary: {
        currentlyReserved: activeReserved.length,
        expiringSoon: expiringSoon.length,
        expiredToday: expiredToday.length,
        fulfilledToday: fulfilledToday.length,
      },
      watchlist,
    };
  }

  async getSessionHistory(now = new Date()): Promise<AdminSessionHistoryDto> {
    const today = getHoChiMinhDayRange(now);

    const completedSessions = await this.prisma.parkingSession.findMany({
      where: {
        status: SessionStatus.completed,
        checkOutTime: {
          gte: today.start,
          lte: today.end,
        },
      },
      include: {
        payment: true,
        slot: {
          include: {
            floor: true,
          },
        },
        reservation: {
          include: {
            driver: {
              select: {
                fullName: true,
                phone: true,
              },
            },
          },
        },
        vehicle: {
          include: {
            vehicleUsers: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        checkOutTime: 'desc',
      },
    });

    const items: AdminSessionHistoryItemDto[] = completedSessions.map((session) => {
      let driverName: string | null = null;
      let driverPhone: string | null = null;

      if (session.reservation?.driver) {
        driverName = session.reservation.driver.fullName;
        driverPhone = session.reservation.driver.phone;
      } else if (session.vehicle) {
        const owner = session.vehicle.vehicleUsers.find((vu) => vu.role === 'owner')?.user;
        if (owner) {
          driverName = owner.fullName;
          driverPhone = owner.phone;
        } else if (session.vehicle.vehicleUsers.length > 0) {
          const firstDriver = session.vehicle.vehicleUsers[0].user;
          driverName = firstDriver.fullName;
          driverPhone = firstDriver.phone;
        }
      }

      let durationMinutes: number | null = null;
      if (session.checkInTime && session.checkOutTime) {
        durationMinutes = Math.floor(
          (session.checkOutTime.getTime() - session.checkInTime.getTime()) / 1000 / 60,
        );
      }

      return {
        id: session.id,
        sessionCode: session.sessionCode,
        status: session.status,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime.toISOString(),
        checkOutTime: session.checkOutTime?.toISOString() ?? null,
        durationMinutes,
        slotCode: session.slot?.code ?? null,
        floorName: session.slot?.floor?.name ?? null,
        isLostTicket: session.isLostTicket,
        driverName,
        driverPhone,
        payment: session.payment
          ? {
              id: session.payment.id,
              amount: session.payment.amount,
              method: session.payment.method,
              status: session.payment.status,
              paidAt: session.payment.paidAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    const totalSessions = items.length;
    const totalRevenue = items.reduce((sum, item) => sum + (item.payment?.amount ?? 0), 0);

    return {
      meta: {
        selectedDate: now.toISOString().split('T')[0],
        timezone: 'Asia/Ho_Chi_Minh',
        range: {
          start: today.start.toISOString(),
          end: today.end.toISOString(),
        },
      },
      summary: {
        totalSessions,
        totalRevenue,
      },
      items,
    };
  }

  async getSessionEvidence(sessionId: string): Promise<AdminSessionEvidenceDto> {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        sessionCode: true,
        licensePlate: true,
        plateNumberConfirmed: true,
        vehicleType: true,
        status: true,
        checkInTime: true,
        checkOutTime: true,
        slot: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    const evidences = await this.prisma.ocrEvidence.findMany({
      where: { sessionId },
      orderBy: [{ capturedAt: 'desc' }],
      select: {
        id: true,
        eventType: true,
        thumbnailKey: true,
        imageKey: true,
        imageExpiresAt: true,
        imageDeletedAt: true,
        thumbnailExpiresAt: true,
        thumbnailDeletedAt: true,
        ocrPlate: true,
        confirmedPlate: true,
        ocrConfidence: true,
        capturedAt: true,
        providerTimestamp: true,
        staff: {
          select: {
            fullName: true,
            phone: true,
          },
        },
      },
    });

    const checkInEvidence = evidences.find((evidence) => evidence.eventType === 'check_in') ?? null;
    const checkOutEvidence = evidences.find((evidence) => evidence.eventType === 'check_out') ?? null;

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        licensePlate: session.licensePlate,
        plateNumberConfirmed: session.plateNumberConfirmed,
        vehicleType: session.vehicleType,
        status: session.status,
        checkInTime: session.checkInTime.toISOString(),
        checkOutTime: session.checkOutTime?.toISOString() ?? null,
        slotCode: session.slot?.code ?? null,
      },
      checkInEvidence: checkInEvidence ? mapSessionEvidence(checkInEvidence) : null,
      checkOutEvidence: checkOutEvidence ? mapSessionEvidence(checkOutEvidence) : null,
    };
  }

  // ─── Slot Occupancy Map ────────────────────────────────────────────────────

  async getSlotOccupancyMap(now = new Date()): Promise<AdminSlotOccupancyMapDto> {
    // 1. Fetch all floors + slots in a single round-trip
    const floors = await this.prisma.floor.findMany({
      orderBy: { floorNumber: 'asc' },
      select: {
        floorNumber: true,
        name: true,
        slots: {
          orderBy: [{ zone: 'asc' }, { slotNumber: 'asc' }],
          select: {
            id: true,
            code: true,
            status: true,
            vehicleType: true,
            zone: true,
            slotNumber: true,
          },
        },
      },
    });

    // 2. Fetch all open sessions (vehicle still in-lot) keyed by slotId
    const openSessions = await this.prisma.parkingSession.findMany({
      where: {
        status: {
          in: [SessionStatus.active, SessionStatus.checkout_pending, SessionStatus.exit_authorized],
        },
      },
      select: {
        id: true,
        sessionCode: true,
        licensePlate: true,
        status: true,
        checkInTime: true,
        slotId: true,
        payment: {
          select: {
            id: true,
            method: true,
            status: true,
            paidAt: true,
            expiredAt: true,
          },
        },
        ocrEvidences: {
          where: { eventType: 'check_in' },
          orderBy: { capturedAt: 'asc' },
          take: 1,
          select: {
            id: true,
            thumbnailKey: true,
            thumbnailDeletedAt: true,
            thumbnailExpiresAt: true,
          },
        },
      },
    });

    // Index sessions by slotId for O(1) lookup
    const sessionBySlotId = new Map(openSessions.map((s) => [s.slotId, s]));

    // 3. Build grouped response
    const floorDtos: SlotOccupancyMapFloorDto[] = floors.map((floor) => {
      const zoneMap = new Map<'A' | 'B', SlotOccupancyMapSlotDto[]>([
        ['A', []],
        ['B', []],
      ]);

      for (const slot of floor.slots) {
        const session = sessionBySlotId.get(slot.id) ?? null;
        const risk = session ? computeSlotRisk(session, now) : { level: 'normal' as SlotOccupancyMapRiskLevel, reason: null };

        const sessionDto = session
          ? {
              id: session.id,
              sessionCode: session.sessionCode,
              plate: session.licensePlate,
              checkInTime: session.checkInTime.toISOString(),
              durationMinutes: Math.floor(
                (now.getTime() - session.checkInTime.getTime()) / 60_000,
              ),
              status: session.status as 'active' | 'checkout_pending' | 'exit_authorized',
              thumbnailUrl: buildThumbnailUrl(session.ocrEvidences[0] ?? null),
            }
          : null;

        const slotDto: SlotOccupancyMapSlotDto = {
          id: slot.id,
          code: slot.code,
          status: slot.status as 'available' | 'occupied' | 'reserved' | 'maintenance',
          vehicleType: slot.vehicleType as 'car' | 'motorbike',
          floorNumber: floor.floorNumber,
          floorName: floor.name,
          zone: slot.zone as 'A' | 'B',
          session: sessionDto,
          risk,
        };

        const zoneSlots = zoneMap.get(slot.zone as 'A' | 'B');
        if (zoneSlots) zoneSlots.push(slotDto);
      }

      const zones: SlotOccupancyMapZoneDto[] = [];
      for (const [zone, slots] of zoneMap) {
        if (slots.length > 0) zones.push({ zone, slots });
      }

      return {
        floorNumber: floor.floorNumber,
        floorName: floor.name,
        zones,
      };
    });

    return {
      generatedAt: now.toISOString(),
      thresholds: MAP_THRESHOLDS,
      floors: floorDtos,
    };
  }
}

// ─── Slot Occupancy Map Helpers ────────────────────────────────────────────

type OpenSessionShape = {
  id: string;
  status: SessionStatus;
  checkInTime: Date;
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    paidAt: Date | null;
    expiredAt: Date | null;
  } | null;
};

type OcrEvidenceThumbnailShape = {
  id: string;
  thumbnailKey: string | null;
  thumbnailDeletedAt: Date | null;
  thumbnailExpiresAt: Date | null;
} | null;

function computeSlotRisk(session: OpenSessionShape, now: Date): SlotOccupancyMapRiskDto {
  const durationMinutes = diffMinutes(now, session.checkInTime);
  const durationHours = durationMinutes / 60;

  // critical: session >= 24h
  if (
    session.status === SessionStatus.active &&
    durationHours >= MAP_THRESHOLDS.longActiveSessionHours
  ) {
    return {
      level: 'critical',
      reason: `Vehicle has been parked for ${Math.floor(durationHours)}h — exceeds 24h threshold.`,
    };
  }

  // critical: checkout_pending > 30 minutes
  if (session.status === SessionStatus.checkout_pending) {
    const anchor =
      session.payment?.expiredAt && session.payment.method === PaymentMethod.bank_qr
        ? new Date(
            session.payment.expiredAt.getTime() -
              MAP_THRESHOLDS.pendingBankQrMinutes * 60 * 1000,
          )
        : session.checkInTime;
    const ageMinutes = diffMinutes(now, anchor);
    if (ageMinutes > MAP_THRESHOLDS.checkoutPendingMinutes) {
      return {
        level: 'critical',
        reason: `Checkout has been pending for ${ageMinutes}m — exceeds ${MAP_THRESHOLDS.checkoutPendingMinutes}m threshold.`,
      };
    }
  }

  // critical: exit_authorized > 10 minutes
  if (session.status === SessionStatus.exit_authorized) {
    const anchor = session.payment?.paidAt ?? session.checkInTime;
    const ageMinutes = diffMinutes(now, anchor);
    if (ageMinutes > MAP_THRESHOLDS.exitAuthorizedMinutes) {
      return {
        level: 'critical',
        reason: `Exit authorized ${ageMinutes}m ago — vehicle has not left the lot.`,
      };
    }
  }

  // critical: Bank QR pending > 15 minutes
  if (
    session.payment?.status === PaymentStatus.pending &&
    session.payment.method === PaymentMethod.bank_qr
  ) {
    const anchor = session.payment.expiredAt
      ? new Date(
          session.payment.expiredAt.getTime() -
            MAP_THRESHOLDS.pendingBankQrMinutes * 60 * 1000,
        )
      : session.checkInTime;
    const ageMinutes = diffMinutes(now, anchor);
    if (ageMinutes > MAP_THRESHOLDS.pendingBankQrMinutes) {
      return {
        level: 'critical',
        reason: `Bank QR payment has been pending for ${ageMinutes}m — exceeds ${MAP_THRESHOLDS.pendingBankQrMinutes}m threshold.`,
      };
    }
  }

  // warning: session >= 12h
  if (durationHours >= MAP_THRESHOLDS.warningActiveHours) {
    return {
      level: 'warning',
      reason: `Vehicle has been parked for ${Math.floor(durationHours)}h — approaching 24h threshold.`,
    };
  }

  // warning: checked in on a previous calendar day (Ho Chi Minh TZ)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const checkInDay = formatter.format(session.checkInTime);
  const nowDay = formatter.format(now);
  if (checkInDay < nowDay) {
    return {
      level: 'warning',
      reason: `Vehicle checked in on ${checkInDay} — overnight stay detected.`,
    };
  }

  return { level: 'normal', reason: null };
}

function buildThumbnailUrl(evidence: OcrEvidenceThumbnailShape): string | null {
  if (!evidence) return null;
  if (!evidence.thumbnailKey) return null;
  // Treat deleted or hard-expired thumbnails as unavailable
  if (evidence.thumbnailDeletedAt) return null;
  return `/api/ocr-evidences/${evidence.id}/thumbnail`;
}

const reservationAuditInclude = {
  driver: {
    select: {
      fullName: true,
      phone: true,
    },
  },
  vehicle: {
    select: {
      plateNumber: true,
      vehicleType: true,
    },
  },
  slot: {
    select: {
      code: true,
      status: true,
      floor: {
        select: {
          floorNumber: true,
          name: true,
        },
      },
    },
  },
  session: {
    select: {
      sessionCode: true,
      checkInTime: true,
    },
  },
} as const;

type ReservationAuditRecord = {
  id: string;
  status: ReservationStatus;
  vehicleType: VehicleType;
  createdAt: Date;
  expiresAt: Date | null;
  driver: { fullName: string | null; phone: string | null } | null;
  vehicle: { plateNumber: string; vehicleType: VehicleType } | null;
  slot: {
    code: string;
    status: SlotStatus;
    floor: { floorNumber: number; name: string };
  } | null;
  session: {
    sessionCode: string;
    checkInTime: Date;
  } | null;
};

function buildSlotSummary(
  slots: {
    status: SlotStatus;
    vehicleType: VehicleType;
    zone: string;
    floor: { floorNumber: number; name: string };
  }[],
): SlotSummaryDto {
  const totalMetric = makeSlotMetric();
  const byVehicleType = {
    car: makeSlotMetric(),
    motorbike: makeSlotMetric(),
  };
  const floorMap = new Map<string, FloorSlotMetricDto>();
  const zoneMap = new Map<string, ZoneSlotMetricDto>();

  for (const slot of slots) {
    addSlot(totalMetric, slot.status);
    addSlot(byVehicleType[slot.vehicleType], slot.status);

    const floorKey = String(slot.floor.floorNumber);
    const floorMetric =
      floorMap.get(floorKey) ??
      ({
        floor: slot.floor.name || slot.floor.floorNumber,
        ...makeSlotMetric(),
        occupancyRate: 0,
      } satisfies FloorSlotMetricDto);
    addSlot(floorMetric, slot.status);
    floorMetric.occupancyRate = occupancyRate(floorMetric.occupied, floorMetric.total);
    floorMap.set(floorKey, floorMetric);

    const zoneKey = `${slot.floor.floorNumber}-${slot.zone}`;
    const zoneMetric =
      zoneMap.get(zoneKey) ??
      ({
        floor: slot.floor.name || slot.floor.floorNumber,
        zone: slot.zone,
        ...makeSlotMetric(),
        occupancyRate: 0,
      } satisfies ZoneSlotMetricDto);
    addSlot(zoneMetric, slot.status);
    zoneMetric.occupancyRate = occupancyRate(zoneMetric.occupied, zoneMetric.total);
    zoneMap.set(zoneKey, zoneMetric);
  }

  return {
    ...totalMetric,
    occupancyRate: occupancyRate(totalMetric.occupied, totalMetric.total),
    byVehicleType,
    byFloor: Array.from(floorMap.values()),
    byZone: Array.from(zoneMap.values()),
  };
}

function buildReservationWatchlist({
  now,
  activeReserved,
  expiredToday,
  fulfilledToday,
}: {
  now: Date;
  activeReserved: ReservationAuditRecord[];
  expiredToday: ReservationAuditRecord[];
  fulfilledToday: ReservationAuditRecord[];
}): AdminReservationAuditItemDto[] {
  const priority = new Map<string, number>();
  const records = new Map<string, ReservationAuditRecord>();

  for (const reservation of activeReserved) {
    const isExpiringSoon =
      reservation.expiresAt !== null &&
      reservation.expiresAt.getTime() > now.getTime() &&
      reservation.expiresAt.getTime() <= now.getTime() + 5 * 60 * 1000;
    priority.set(reservation.id, isExpiringSoon ? 0 : 1);
    records.set(reservation.id, reservation);
  }

  for (const reservation of expiredToday) {
    priority.set(reservation.id, Math.min(priority.get(reservation.id) ?? 2, 2));
    records.set(reservation.id, reservation);
  }

  for (const reservation of fulfilledToday) {
    priority.set(reservation.id, Math.min(priority.get(reservation.id) ?? 3, 3));
    records.set(reservation.id, reservation);
  }

  return Array.from(records.values())
    .sort((left, right) => {
      const leftPriority = priority.get(left.id) ?? 99;
      const rightPriority = priority.get(right.id) ?? 99;
      const priorityDiff = leftPriority - rightPriority;
      if (priorityDiff !== 0) return priorityDiff;

      const leftAnchor = getReservationWatchlistAnchor(left);
      const rightAnchor = getReservationWatchlistAnchor(right);
      if (leftPriority <= 1) {
        return leftAnchor.getTime() - rightAnchor.getTime();
      }
      return rightAnchor.getTime() - leftAnchor.getTime();
    })
    .slice(0, 25)
    .map((reservation) => mapReservationAuditItem(reservation, now));
}

function mapReservationAuditItem(
  reservation: ReservationAuditRecord,
  now: Date,
): AdminReservationAuditItemDto {
  const expiresAt = reservation.expiresAt?.toISOString() ?? null;
  const fulfilledAt = reservation.session?.checkInTime?.toISOString() ?? null;
  const timeLeftMinutes =
    reservation.status === ReservationStatus.active && reservation.expiresAt
      ? Math.ceil((reservation.expiresAt.getTime() - now.getTime()) / 60000)
      : reservation.status === ReservationStatus.expired && reservation.expiresAt
        ? -Math.max(0, diffMinutes(now, reservation.expiresAt))
        : null;

  return {
    id: reservation.id,
    status: reservation.status,
    driverName: reservation.driver?.fullName ?? null,
    driverPhone: reservation.driver?.phone ?? null,
    plateNumber: reservation.vehicle?.plateNumber ?? null,
    vehicleType: reservation.vehicle?.vehicleType ?? reservation.vehicleType ?? null,
    slotCode: reservation.slot?.code ?? null,
    createdAt: reservation.createdAt.toISOString(),
    expiresAt,
    fulfilledAt,
    timeLeftMinutes,
    fulfilledSessionCode: reservation.session?.sessionCode ?? null,
  };
}

function getReservationWatchlistAnchor(reservation: ReservationAuditRecord): Date {
  if (reservation.status === ReservationStatus.active) {
    return reservation.expiresAt ?? reservation.createdAt;
  }
  if (reservation.status === ReservationStatus.fulfilled) {
    return reservation.session?.checkInTime ?? reservation.createdAt;
  }
  return reservation.expiresAt ?? reservation.createdAt;
}

function buildPaymentRiskSummary(
  payments: {
    method: PaymentMethod;
    status: PaymentStatus;
    expiredAt: Date | null;
  }[],
  now: Date,
): AdminSummaryDto['todayStatus']['paymentRisk'] {
  const pending = payments.filter((p) => p.status === PaymentStatus.pending);
  const critical = payments.filter((p) => p.status === PaymentStatus.failed).length;
  const warning = pending.filter(
    (p) =>
      p.method === PaymentMethod.bank_qr &&
      p.expiredAt !== null &&
      p.expiredAt.getTime() <= now.getTime(),
  ).length;
  const normal = pending.length - warning;

  return {
    normal,
    warning,
    critical,
    total: normal + warning + critical,
  };
}

function makeSlotMetric(): SlotMetricDto {
  return { total: 0, available: 0, reserved: 0, occupied: 0 };
}

function addSlot(metric: SlotMetricDto, status: SlotStatus) {
  metric.total += 1;
  if (status === SlotStatus.available) metric.available += 1;
  if (status === SlotStatus.reserved) metric.reserved += 1;
  if (status === SlotStatus.occupied) metric.occupied += 1;
}

function occupancyRate(occupied: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((occupied / total) * 10000) / 100;
}

function sumAmount(payments: { amount: number }[]): number {
  return payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
}

function isWithinRange(value: Date | string | null | undefined, start: Date, end: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function getHoChiMinhDayRange(now: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const start = new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - 7 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function diffMinutes(now: Date, since: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
}

function buildFlag(
  input: Partial<Omit<AdminOperationFlagDto, 'createdAt'>> &
    Pick<AdminOperationFlagDto, 'type' | 'severity' | 'message' | 'ageMinutes'> & {
      createdAt: Date;
    },
): AdminOperationFlagDto {
  return {
    type: input.type,
    severity: input.severity,
    sessionId: input.sessionId ?? null,
    sessionCode: input.sessionCode ?? null,
    reservationCode: input.reservationCode ?? null,
    paymentId: input.paymentId ?? null,
    plateNumber: input.plateNumber ?? null,
    message: input.message,
    createdAt: input.createdAt.toISOString(),
    ageMinutes: input.ageMinutes,
  };
}

function mapSessionEvidence(
  evidence: {
    id: string;
    eventType: 'check_in' | 'check_out';
    thumbnailKey: string | null;
    imageKey: string | null;
    imageExpiresAt: Date | null;
    imageDeletedAt: Date | null;
    thumbnailExpiresAt: Date | null;
    thumbnailDeletedAt: Date | null;
    ocrPlate: string | null;
    confirmedPlate: string | null;
    ocrConfidence: number | null;
    capturedAt: Date;
    providerTimestamp: Date | null;
    staff: { fullName: string | null; phone: string | null } | null;
  },
): AdminSessionEvidenceItemDto {
  return {
    id: evidence.id,
    eventType: evidence.eventType,
    thumbnailUrl: evidence.thumbnailKey ? `/api/ocr-evidences/${evidence.id}/thumbnail` : null,
    imageUrl: evidence.imageKey ? `/api/ocr-evidences/${evidence.id}/image` : null,
    ocrPlate: evidence.ocrPlate,
    confirmedPlate: evidence.confirmedPlate,
    ocrConfidence: evidence.ocrConfidence,
    capturedAt: evidence.capturedAt.toISOString(),
    providerTimestamp: evidence.providerTimestamp?.toISOString() ?? null,
    staffName: evidence.staff?.fullName ?? null,
    staffPhone: evidence.staff?.phone ?? null,
    imageStatus: resolveEvidenceImageStatus(evidence),
  };
}

function resolveEvidenceImageStatus(evidence: {
  thumbnailKey: string | null;
  imageKey: string | null;
  imageDeletedAt: Date | null;
  thumbnailDeletedAt: Date | null;
  imageExpiresAt: Date | null;
  thumbnailExpiresAt: Date | null;
}): AdminSessionEvidenceItemDto['imageStatus'] {
  if (evidence.thumbnailKey || evidence.imageKey) return 'available';
  if (
    evidence.imageDeletedAt ||
    evidence.thumbnailDeletedAt ||
    (evidence.imageExpiresAt && evidence.imageExpiresAt.getTime() <= Date.now()) ||
    (evidence.thumbnailExpiresAt && evidence.thumbnailExpiresAt.getTime() <= Date.now())
  ) {
    return 'expired';
  }
  return 'missing';
}

function severityRank(severity: AdminOperationFlagDto['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function getPaymentMonitoringAnchor(
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    paidAt: Date | null;
    expiredAt: Date | null;
    session: { checkInTime: Date } | null;
  },
  now: Date,
): Date {
  if (payment.status === PaymentStatus.paid && payment.paidAt) {
    return payment.paidAt;
  }

  // Payment.createdAt is not present in the Phase 1 schema. VNPAY Bank QR
  // payments store expiredAt as create time + 15 minutes, which gives the
  // safest current approximation without adding a migration.
  if (payment.method === PaymentMethod.bank_qr && payment.expiredAt) {
    return new Date(
      payment.expiredAt.getTime() -
        FLAG_THRESHOLDS.pendingBankQrMinutes * 60 * 1000,
    );
  }

  return payment.session?.checkInTime ?? now;
}

function classifyPaymentMonitoringItem(
  payment: {
    amount: number;
    method: PaymentMethod;
    provider: string | null;
    status: PaymentStatus;
    session: { status: SessionStatus } | null;
  },
  ageMinutes: number,
): {
  risk: PaymentMonitoringRisk;
  reason: string;
  recommendedAction: string;
} {
  let decision: {
    risk: PaymentMonitoringRisk;
    reason: string;
    recommendedAction: string;
  };

  if (
    payment.status === PaymentStatus.paid &&
    payment.session?.status !== SessionStatus.exit_authorized &&
    payment.session?.status !== SessionStatus.completed
  ) {
    decision = {
      risk: 'critical',
      reason: 'Payment is paid but session has not been authorized for exit.',
      recommendedAction: 'Check payment-session synchronization immediately.',
    };
  } else if (
    payment.status === PaymentStatus.pending &&
    payment.method === PaymentMethod.bank_qr &&
    ageMinutes > FLAG_THRESHOLDS.pendingBankQrMinutes
  ) {
    decision = {
      risk: 'warning',
      reason: 'Bank QR payment has been pending for more than 15 minutes.',
      recommendedAction:
        'Ask staff to refresh payment status, regenerate payment link, or switch to cash if needed.',
    };
  } else if (payment.status === PaymentStatus.pending && payment.method === PaymentMethod.cash) {
    decision = {
      risk: 'normal',
      reason: 'Cash payment is waiting for staff confirmation.',
      recommendedAction:
        'Staff should confirm cash payment at the gate after receiving money.',
    };
  } else {
    decision = {
      risk: 'normal',
      reason: 'Payment is still within expected waiting time.',
      recommendedAction: 'Wait for customer payment or refresh payment status.',
    };
  }

  if (
    decision.risk !== 'critical' &&
    payment.method === PaymentMethod.bank_qr &&
    Number(payment.amount || 0) < 10000
  ) {
    return {
      risk: 'critical',
      reason: 'Bank QR amount is below the minimum 10,000 VND payment requirement.',
      recommendedAction:
        'Regenerate the payment using the updated pricing rule or switch to cash.',
    };
  }

  return decision;
}

function paymentRiskRank(risk: PaymentMonitoringRisk): number {
  if (risk === 'critical') return 0;
  if (risk === 'warning') return 1;
  return 2;
}

function resolveResponsibleStaff(payment: {
  receivedUser?: StaffShape | null;
  method: PaymentMethod;
  session?: {
    checkedOutBy?: StaffShape | null;
    checkedInBy?: StaffShape | null;
  } | null;
}): AdminPendingPaymentItemDto['responsibleStaff'] {
  // No payment-created-by field exists in the current Prisma schema.
  // checkedOutBy is the closest existing checkout owner when present.
  if (payment.session?.checkedOutBy) {
    return staffOwner(payment.session.checkedOutBy, 'checkout_started_by');
  }

  if (payment.method === PaymentMethod.cash && payment.receivedUser) {
    return staffOwner(payment.receivedUser, 'cash_confirmed_by');
  }

  if (payment.session?.checkedInBy) {
    return staffOwner(payment.session.checkedInBy, 'checkin_staff');
  }

  return {
    id: null,
    name: null,
    phone: null,
    source: 'unknown',
  };
}

type StaffShape = {
  id: string;
  fullName: string | null;
  phone: string;
};

function staffOwner(
  staff: StaffShape,
  source: AdminPendingPaymentItemDto['responsibleStaff']['source'],
): AdminPendingPaymentItemDto['responsibleStaff'] {
  return {
    id: staff.id,
    name: staff.fullName,
    phone: staff.phone,
    source,
  };
}

function formatWaitingLabel(
  ageMinutes: number,
  payment: { method: PaymentMethod; status: PaymentStatus },
  risk: PaymentMonitoringRisk,
): string {
  if (
    risk === 'warning' &&
    payment.status === PaymentStatus.pending &&
    payment.method === PaymentMethod.bank_qr &&
    ageMinutes > FLAG_THRESHOLDS.pendingBankQrMinutes
  ) {
    return `Overdue by ${formatDuration(ageMinutes - FLAG_THRESHOLDS.pendingBankQrMinutes)}`;
  }

  return formatDuration(ageMinutes);
}

function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, totalMinutes);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatLocationLabel(
  slotCode: string | null,
  floor: string | number | null,
  zone: string | null,
): string {
  const parts = [
    slotCode,
    floor ? `Floor ${floor}` : null,
    zone ? `Zone ${zone}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'Unknown location';
}
