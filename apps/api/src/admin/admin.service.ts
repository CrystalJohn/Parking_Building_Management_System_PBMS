import { Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  Role,
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
  AdminSummaryDto,
  FloorSlotMetricDto,
  SlotMetricDto,
  ZoneSlotMetricDto,
} from './dto/admin-summary.dto';

const FLAG_THRESHOLDS = {
  longActiveSessionHours: 24,
  checkoutPendingMinutes: 30,
  exitAuthorizedMinutes: 10,
  pendingBankQrMinutes: 15,
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(now = new Date()): Promise<AdminSummaryDto> {
    const today = getHoChiMinhDayRange(now);

    const [users, slots, sessions, reservations, payments] = await Promise.all([
      this.prisma.user.findMany({
        select: { role: true, isActive: true },
      }),
      this.prisma.slot.findMany({
        select: {
          status: true,
          vehicleType: true,
          zone: true,
          floor: { select: { floorNumber: true, name: true } },
        },
      }),
      this.prisma.parkingSession.findMany({
        select: { status: true, checkOutTime: true },
      }),
      this.prisma.reservation.findMany({
        select: { status: true, createdAt: true, expiresAt: true },
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

    return {
      meta: {
        date: reportDate,
        timezone: 'Asia/Ho_Chi_Minh',
        range: {
          start: today.start.toISOString(),
          end: today.end.toISOString(),
        },
      },
      users: buildUserSummary(users),
      slots: buildSlotSummary(slots),
      sessions: {
        active: sessions.filter((s) => s.status === SessionStatus.active).length,
        checkoutPending: sessions.filter((s) => s.status === SessionStatus.checkout_pending).length,
        exitAuthorized: sessions.filter((s) => s.status === SessionStatus.exit_authorized).length,
        completedToday: sessions.filter(
          (s) =>
            s.status === SessionStatus.completed &&
            isWithinRange(s.checkOutTime, today.start, today.end),
        ).length,
      },
      reservations: {
        active: reservations.filter((r) => r.status === ReservationStatus.active).length,
        fulfilledToday: reservations.filter(
          (r) =>
            r.status === ReservationStatus.fulfilled &&
            isWithinRange(r.createdAt, today.start, today.end),
        ).length,
        cancelledToday: reservations.filter(
          (r) =>
            r.status === ReservationStatus.cancelled &&
            isWithinRange(r.createdAt, today.start, today.end),
        ).length,
        expiredToday: reservations.filter(
          (r) =>
            r.status === ReservationStatus.expired &&
            (isWithinRange(r.expiresAt, today.start, today.end) ||
              isWithinRange(r.createdAt, today.start, today.end)),
        ).length,
      },
      payments: buildPaymentSummary(payments, today),
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
              sessionCode: session.sessionCode,
              paymentId: session.payment?.id ?? null,
              plateNumber: session.licensePlate,
              createdAt: anchor,
              ageMinutes,
              message: 'Checkout has been pending for more than 30 minutes.',
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
}

function buildUserSummary(users: { role: Role; isActive: boolean }[]): AdminSummaryDto['users'] {
  return {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    byRole: {
      admin: users.filter((u) => u.role === Role.admin).length,
      manager: users.filter((u) => u.role === Role.manager).length,
      staff: users.filter((u) => u.role === Role.staff).length,
      driver: users.filter((u) => u.role === Role.driver).length,
    },
  };
}

function buildSlotSummary(
  slots: {
    status: SlotStatus;
    vehicleType: VehicleType;
    zone: string;
    floor: { floorNumber: number; name: string };
  }[],
): AdminSummaryDto['slots'] {
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

function buildPaymentSummary(
  payments: {
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    paidAt: Date | null;
    provider: string | null;
    expiredAt: Date | null;
  }[],
  today: { start: Date; end: Date },
): AdminSummaryDto['payments'] {
  const paidToday = payments.filter(
    (p) => p.status === PaymentStatus.paid && isWithinRange(p.paidAt, today.start, today.end),
  );

  return {
    pending: payments.filter((p) => p.status === PaymentStatus.pending).length,
    paidToday: paidToday.length,
    // Payment has no failed/cancelled transition timestamp in Phase 1. Failed
    // can only be safely counted for "today" when expiredAt is present.
    failedToday: payments.filter(
      (p) => p.status === PaymentStatus.failed && isWithinRange(p.expiredAt, today.start, today.end),
    ).length,
    cancelledToday: 0,
    expiredToday: payments.filter(
      (p) => p.status === PaymentStatus.expired && isWithinRange(p.expiredAt, today.start, today.end),
    ).length,
    revenueToday: sumAmount(paidToday),
    byMethod: {
      cash: sumAmount(paidToday.filter((p) => p.method === PaymentMethod.cash)),
      bankQr: sumAmount(paidToday.filter((p) => p.method === PaymentMethod.bank_qr)),
    },
    byProvider: {
      vnpay: sumAmount(
        paidToday.filter((p) => (p.provider ?? '').toLowerCase() === 'vnpay'),
      ),
    },
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
    sessionCode: input.sessionCode ?? null,
    reservationCode: input.reservationCode ?? null,
    paymentId: input.paymentId ?? null,
    plateNumber: input.plateNumber ?? null,
    message: input.message,
    createdAt: input.createdAt.toISOString(),
    ageMinutes: input.ageMinutes,
  };
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
