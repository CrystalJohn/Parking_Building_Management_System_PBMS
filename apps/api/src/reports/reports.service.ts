import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export interface RevenueRow {
  period: string;
  vehicleType: string;
  totalSessions: number;
  totalRevenue: number;
  totalPenalty: number;
}

export interface TrafficRow {
  period: string;
  hour?: number;
  floorNumber?: number;
  floorName?: string;
  entryCount: number;
  exitCount: number;
}

export interface OccupancyRow {
  floorNumber: number;
  floorName: string;
  zone: string;
  vehicleType: string;
  totalSlots: number;
  avgOccupancy: number;
  peakOccupancy: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 26.1: Revenue report — breakdown by vehicle type and time period.
   * Uses DATE_TRUNC for grouping by day/week/month.
   * Req 11.1
   */
  async getRevenue(period: ReportPeriod, date: string): Promise<RevenueRow[]> {
    const truncUnit = this.getTruncUnit(period);
    const { startDate, endDate } = this.getDateRange(period, date);

    const rows = await this.prisma.$queryRaw<
      {
        period: Date;
        vehicle_type: string;
        total_sessions: bigint;
        total_revenue: bigint;
        total_penalty: bigint;
      }[]
    >`
      SELECT
        DATE_TRUNC(${truncUnit}, ps.check_out_time) AS period,
        ps.vehicle_type,
        COUNT(*)::bigint AS total_sessions,
        COALESCE(SUM(p.amount), 0)::bigint AS total_revenue,
        COALESCE(SUM(ps.penalty_amount), 0)::bigint AS total_penalty
      FROM parking_sessions ps
      LEFT JOIN payments p ON p.session_id = ps.id
      WHERE ps.status = 'completed'
        AND ps.check_out_time >= ${startDate}
        AND ps.check_out_time < ${endDate}
      GROUP BY DATE_TRUNC(${truncUnit}, ps.check_out_time), ps.vehicle_type
      ORDER BY period ASC, ps.vehicle_type ASC
    `;

    return rows.map((r) => ({
      period: r.period.toISOString(),
      vehicleType: r.vehicle_type,
      totalSessions: Number(r.total_sessions),
      totalRevenue: Number(r.total_revenue),
      totalPenalty: Number(r.total_penalty),
    }));
  }

  /**
   * 26.2: Traffic report — entry/exit count by hour and floor.
   * Req 11.2
   */
  async getTraffic(period: ReportPeriod, date: string): Promise<TrafficRow[]> {
    const { startDate, endDate } = this.getDateRange(period, date);

    const rows = await this.prisma.$queryRaw<
      {
        the_date: Date;
        hour: number;
        floor_number: number;
        floor_name: string;
        entry_count: bigint;
        exit_count: bigint;
      }[]
    >`
      SELECT
        DATE_TRUNC('day', ps.check_in_time) AS the_date,
        EXTRACT(HOUR FROM ps.check_in_time)::int AS hour,
        f.floor_number,
        f.name AS floor_name,
        COUNT(*)::bigint AS entry_count,
        COUNT(ps.check_out_time)::bigint AS exit_count
      FROM parking_sessions ps
      JOIN slots s ON s.id = ps.slot_id
      JOIN floors f ON f.id = s.floor_id
      WHERE ps.check_in_time >= ${startDate}
        AND ps.check_in_time < ${endDate}
      GROUP BY DATE_TRUNC('day', ps.check_in_time),
               EXTRACT(HOUR FROM ps.check_in_time),
               f.floor_number, f.name
      ORDER BY the_date ASC, hour ASC, f.floor_number ASC
    `;

    return rows.map((r) => ({
      period: r.the_date.toISOString(),
      hour: r.hour,
      floorNumber: r.floor_number,
      floorName: r.floor_name,
      entryCount: Number(r.entry_count),
      exitCount: Number(r.exit_count),
    }));
  }

  /**
   * 26.3: Occupancy report — average and peak utilization by floor/zone.
   * Uses a snapshot approach: counts current occupied+reserved vs total.
   * For historical avg/peak, we'd need time-series data (future enhancement).
   * Current implementation: real-time snapshot.
   * Req 11.3
   */
  async getOccupancy(): Promise<OccupancyRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        floor_number: number;
        floor_name: string;
        zone: string;
        vehicle_type: string;
        total_slots: bigint;
        occupied_count: bigint;
        reserved_count: bigint;
      }[]
    >`
      SELECT
        f.floor_number,
        f.name AS floor_name,
        s.zone,
        s.vehicle_type,
        COUNT(*)::bigint AS total_slots,
        COUNT(*) FILTER (WHERE s.status = 'occupied')::bigint AS occupied_count,
        COUNT(*) FILTER (WHERE s.status = 'reserved')::bigint AS reserved_count
      FROM slots s
      JOIN floors f ON f.id = s.floor_id
      WHERE s.status != 'maintenance'
      GROUP BY f.floor_number, f.name, s.zone, s.vehicle_type
      ORDER BY f.floor_number ASC, s.zone ASC
    `;

    return rows.map((r) => {
      const total = Number(r.total_slots);
      const occupied = Number(r.occupied_count) + Number(r.reserved_count);
      return {
        floorNumber: r.floor_number,
        floorName: r.floor_name,
        zone: r.zone,
        vehicleType: r.vehicle_type,
        totalSlots: total,
        avgOccupancy: total > 0 ? Math.round((occupied / total) * 100) : 0,
        peakOccupancy: total > 0 ? Math.round((occupied / total) * 100) : 0,
      };
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getTruncUnit(period: ReportPeriod): string {
    switch (period) {
      case 'daily':
        return 'day';
      case 'weekly':
        return 'week';
      case 'monthly':
        return 'month';
    }
  }

  private getDateRange(
    period: ReportPeriod,
    date: string,
  ): { startDate: Date; endDate: Date } {
    const base = new Date(date);
    // Reset to start of day
    base.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(base);
        endDate = new Date(base);
        endDate.setDate(endDate.getDate() + 1);
        break;
      case 'weekly':
        // Start of week (Monday)
        const dayOfWeek = base.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(base);
        startDate.setDate(startDate.getDate() - diff);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'monthly':
        startDate = new Date(base.getFullYear(), base.getMonth(), 1);
        endDate = new Date(base.getFullYear(), base.getMonth() + 1, 1);
        break;
    }

    return { startDate, endDate };
  }
}
