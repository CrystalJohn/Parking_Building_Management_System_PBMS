import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Response Types ──────────────────────────────────────────────────────────

export interface UtilizationRow {
  floorId: number;
  floorName: string;
  zone: string;
  vehicleType: string;
  totalSlots: number;
  totalSessions: number;
  avgDurationHours: number;
  utilizationRate: number;
}

export interface AllocationTimeRow {
  strategy: string;
  totalSessions: number;
  avgAllocationTimeMs: number;
  minAllocationTimeMs: number;
  maxAllocationTimeMs: number;
  p95AllocationTimeMs: number;
}

export interface DistributionVarianceRow {
  strategy: string;
  floorId: number;
  floorName: string;
  zone: string;
  sessionCount: number;
  sessionShare: number;
}

export interface DistributionVarianceResult {
  strategy: string;
  floors: { floorId: number; floorName: string; zone: string; sessionCount: number; sessionShare: number }[];
  variance: number;
  stdDev: number;
}

export interface PeakRejectionResult {
  strategy: string;
  totalSessions: number;
  peakOccupancyRate: number;
  peakHour: string;
  rejectionCount: number;
  rejectionRate: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RQ1: Slot utilization per zone/floor.
   * Measures how effectively each zone/floor is used.
   * Uses denormalized floor_id and zone from task 32.
   */
  async getUtilization(strategy?: string): Promise<UtilizationRow[]> {
    const whereClause = strategy
      ? `AND ps.allocation_strategy = '${strategy}'`
      : '';

    const rows = await this.prisma.$queryRawUnsafe<
      {
        floor_id: number;
        floor_name: string;
        zone: string;
        vehicle_type: string;
        total_slots: bigint;
        total_sessions: bigint;
        avg_duration_hours: number;
        utilization_rate: number;
      }[]
    >(`
      WITH slot_counts AS (
        SELECT floor_id, zone, vehicle_type, COUNT(*)::bigint AS total_slots
        FROM slots
        WHERE status != 'maintenance'
        GROUP BY floor_id, zone, vehicle_type
      ),
      session_stats AS (
        SELECT
          ps.floor_id,
          ps.zone,
          ps.vehicle_type,
          COUNT(*)::bigint AS total_sessions,
          AVG(EXTRACT(EPOCH FROM (COALESCE(ps.check_out_time, NOW()) - ps.check_in_time)) / 3600)::float AS avg_duration_hours
        FROM parking_sessions ps
        WHERE ps.floor_id IS NOT NULL
          ${whereClause}
        GROUP BY ps.floor_id, ps.zone, ps.vehicle_type
      )
      SELECT
        sc.floor_id,
        f.name AS floor_name,
        sc.zone::text,
        sc.vehicle_type::text,
        sc.total_slots,
        COALESCE(ss.total_sessions, 0)::bigint AS total_sessions,
        COALESCE(ss.avg_duration_hours, 0)::float AS avg_duration_hours,
        CASE WHEN sc.total_slots > 0
          THEN (COALESCE(ss.total_sessions, 0)::float / sc.total_slots::float)
          ELSE 0
        END AS utilization_rate
      FROM slot_counts sc
      JOIN floors f ON f.id = sc.floor_id
      LEFT JOIN session_stats ss ON ss.floor_id = sc.floor_id AND ss.zone::text = sc.zone::text AND ss.vehicle_type::text = sc.vehicle_type::text
      ORDER BY sc.floor_id, sc.zone, sc.vehicle_type
    `);

    return rows.map((r) => ({
      floorId: r.floor_id,
      floorName: r.floor_name,
      zone: r.zone,
      vehicleType: r.vehicle_type,
      totalSlots: Number(r.total_slots),
      totalSessions: Number(r.total_sessions),
      avgDurationHours: Math.round(r.avg_duration_hours * 100) / 100,
      utilizationRate: Math.round(r.utilization_rate * 100) / 100,
    }));
  }

  /**
   * RQ2: Average allocation_time_ms per strategy.
   * Measures how fast each strategy assigns slots.
   */
  async getAllocationTime(): Promise<AllocationTimeRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        strategy: string;
        total_sessions: bigint;
        avg_time: number;
        min_time: number;
        max_time: number;
        p95_time: number;
      }[]
    >`
      SELECT
        allocation_strategy AS strategy,
        COUNT(*)::bigint AS total_sessions,
        AVG(allocation_time_ms)::float AS avg_time,
        MIN(allocation_time_ms)::float AS min_time,
        MAX(allocation_time_ms)::float AS max_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY allocation_time_ms)::float AS p95_time
      FROM parking_sessions
      WHERE allocation_strategy IS NOT NULL
        AND allocation_time_ms IS NOT NULL
      GROUP BY allocation_strategy
      ORDER BY avg_time ASC
    `;

    return rows.map((r) => ({
      strategy: r.strategy,
      totalSessions: Number(r.total_sessions),
      avgAllocationTimeMs: Math.round(r.avg_time * 100) / 100,
      minAllocationTimeMs: Math.round(r.min_time),
      maxAllocationTimeMs: Math.round(r.max_time),
      p95AllocationTimeMs: Math.round(r.p95_time * 100) / 100,
    }));
  }

  /**
   * RQ3: Distribution variance — how evenly sessions are spread across floors.
   * Low variance = good load balancing.
   */
  async getDistributionVariance(): Promise<DistributionVarianceResult[]> {
    const rows = await this.prisma.$queryRaw<
      {
        strategy: string;
        floor_id: number;
        floor_name: string;
        zone: string;
        session_count: bigint;
      }[]
    >`
      SELECT
        ps.allocation_strategy AS strategy,
        ps.floor_id,
        f.name AS floor_name,
        ps.zone::text,
        COUNT(*)::bigint AS session_count
      FROM parking_sessions ps
      JOIN floors f ON f.id = ps.floor_id
      WHERE ps.allocation_strategy IS NOT NULL
        AND ps.floor_id IS NOT NULL
      GROUP BY ps.allocation_strategy, ps.floor_id, f.name, ps.zone
      ORDER BY ps.allocation_strategy, ps.floor_id, ps.zone
    `;

    // Group by strategy and compute variance
    const strategyMap = new Map<string, { floorId: number; floorName: string; zone: string; sessionCount: number }[]>();

    for (const row of rows) {
      const key = row.strategy;
      if (!strategyMap.has(key)) strategyMap.set(key, []);
      strategyMap.get(key)!.push({
        floorId: row.floor_id,
        floorName: row.floor_name,
        zone: row.zone,
        sessionCount: Number(row.session_count),
      });
    }

    const results: DistributionVarianceResult[] = [];

    for (const [strategy, floors] of strategyMap) {
      const totalSessions = floors.reduce((s, f) => s + f.sessionCount, 0);
      const floorsWithShare = floors.map((f) => ({
        ...f,
        sessionShare: totalSessions > 0
          ? Math.round((f.sessionCount / totalSessions) * 10000) / 100
          : 0,
      }));

      // Compute variance of session counts
      const mean = totalSessions / floors.length;
      const variance = floors.reduce((sum, f) => sum + Math.pow(f.sessionCount - mean, 2), 0) / floors.length;
      const stdDev = Math.sqrt(variance);

      results.push({
        strategy,
        floors: floorsWithShare,
        variance: Math.round(variance * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
      });
    }

    return results;
  }

  /**
   * RQ4: Peak occupancy and rejection rate per strategy.
   * Measures how strategies perform under high load.
   */
  async getPeakRejection(): Promise<PeakRejectionResult[]> {
    // Get session counts per strategy per hour (to find peak)
    const hourlyRows = await this.prisma.$queryRaw<
      {
        strategy: string;
        the_hour: string;
        session_count: bigint;
      }[]
    >`
      SELECT
        allocation_strategy AS strategy,
        TO_CHAR(check_in_time, 'HH24:00') AS the_hour,
        COUNT(*)::bigint AS session_count
      FROM parking_sessions
      WHERE allocation_strategy IS NOT NULL
      GROUP BY allocation_strategy, TO_CHAR(check_in_time, 'HH24:00')
      ORDER BY allocation_strategy, session_count DESC
    `;

    // Get total sessions and current occupancy snapshot per strategy
    const totalRows = await this.prisma.$queryRaw<
      {
        strategy: string;
        total_sessions: bigint;
      }[]
    >`
      SELECT
        allocation_strategy AS strategy,
        COUNT(*)::bigint AS total_sessions
      FROM parking_sessions
      WHERE allocation_strategy IS NOT NULL
      GROUP BY allocation_strategy
    `;

    // Get rejection count from simulation runs (if available)
    const rejectionRows = await this.prisma.$queryRaw<
      {
        strategy: string;
        total_rejections: bigint;
        total_vehicles: bigint;
      }[]
    >`
      SELECT
        strategy,
        COALESCE(SUM(rejection_count), 0)::bigint AS total_rejections,
        COALESCE(SUM(total_vehicles), 0)::bigint AS total_vehicles
      FROM simulation_runs
      GROUP BY strategy
    `;

    // Current occupancy rate
    const totalSlots = await this.prisma.slot.count({
      where: { status: { not: 'maintenance' } },
    });
    const occupiedSlots = await this.prisma.slot.count({
      where: { status: { in: ['occupied', 'reserved'] } },
    });
    const currentOccupancy = totalSlots > 0 ? occupiedSlots / totalSlots : 0;

    // Build results per strategy
    const strategies = new Set<string>();
    for (const r of totalRows) strategies.add(r.strategy);

    const results: PeakRejectionResult[] = [];

    for (const strategy of strategies) {
      const total = totalRows.find((r) => r.strategy === strategy);
      const peakHourRow = hourlyRows.find((r) => r.strategy === strategy);
      const rejection = rejectionRows.find((r) => r.strategy === strategy);

      const totalSessions = Number(total?.total_sessions ?? 0);
      const totalRejections = Number(rejection?.total_rejections ?? 0);
      const totalVehicles = Number(rejection?.total_vehicles ?? 0);

      results.push({
        strategy,
        totalSessions,
        peakOccupancyRate: Math.round(currentOccupancy * 10000) / 100,
        peakHour: peakHourRow?.the_hour ?? 'N/A',
        rejectionCount: totalRejections,
        rejectionRate: totalVehicles > 0
          ? Math.round((totalRejections / totalVehicles) * 10000) / 100
          : 0,
      });
    }

    return results;
  }
}
