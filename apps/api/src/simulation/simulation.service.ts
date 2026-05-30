import { Injectable, BadRequestException } from '@nestjs/common';
import { VehicleType, Zone, SlotStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocationService,
  AllocationStrategy,
  BalancedOccupancyStrategy,
  LowestFloorStrategy,
  RandomStrategy,
} from '../slots/allocation.service';
import { RunSimulationDto } from './dto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SimSlot {
  id: number;
  floorId: number;
  floorNumber: number;
  zone: Zone;
  slotNumber: number;
  code: string;
  status: SlotStatus;
  vehicleType: VehicleType;
  occupiedUntilMinute: number | null; // when the vehicle will leave
  floor: { id: number; floorNumber: number; name: string };
}

type SimEventType = 'arrival' | 'departure';

interface SimEvent {
  minuteOffset: number;
  type: SimEventType;
  vehicleType: VehicleType;
  slotId?: number; // for departure events
}

interface FloorDistribution {
  floorId: number;
  floorName: string;
  zone: string;
  assigned: number;
}

interface HourlyMetrics {
  hour: number;
  arrivals: number;
  assigned: number;
  rejected: number;
  occupancyRate: number;
}

export interface SimulationResult {
  id: string;
  strategy: string;
  scenario: string;
  params: {
    durationMinutes: number;
    arrivalRatePerMinute: number;
    carMotorbikeRatio: number;
    seed: number;
    fullDayMode: boolean;
    meanParkingDurationMinutes: number;
    startHour: number;
  };
  totalVehicles: number;
  totalAssigned: number;
  rejected: number;
  rejectionRate: number;
  avgAllocationTimeMs: number;
  finalOccupancyRate: number;
  peakOccupancyRate: number;
  peakHour: number;
  peakHourRejectionRate: number;
  floorDistribution: FloorDistribution[];
  hourlyMetrics: HourlyMetrics[];
  durationMinutes: number;
}

// ─── Default Hourly Profile (Vietnam office parking) ─────────────────────────
// Based on: Smart Parking Guidance (2016), Motorcycle Drivers Vietnam (2019),
// Study of Parking Patterns for Different Parking Facilities

const DEFAULT_HOURLY_PROFILE = [
  { hour: 0, arrivalMultiplier: 0.05, departureMultiplier: 0.05 },
  { hour: 1, arrivalMultiplier: 0.02, departureMultiplier: 0.02 },
  { hour: 2, arrivalMultiplier: 0.02, departureMultiplier: 0.02 },
  { hour: 3, arrivalMultiplier: 0.02, departureMultiplier: 0.02 },
  { hour: 4, arrivalMultiplier: 0.05, departureMultiplier: 0.02 },
  { hour: 5, arrivalMultiplier: 0.1, departureMultiplier: 0.05 },
  { hour: 6, arrivalMultiplier: 0.5, departureMultiplier: 0.1 },
  { hour: 7, arrivalMultiplier: 2.0, departureMultiplier: 0.2 },  // peak in starts
  { hour: 8, arrivalMultiplier: 2.5, departureMultiplier: 0.2 },  // PEAK IN
  { hour: 9, arrivalMultiplier: 1.0, departureMultiplier: 0.3 },
  { hour: 10, arrivalMultiplier: 0.6, departureMultiplier: 0.4 },
  { hour: 11, arrivalMultiplier: 0.5, departureMultiplier: 0.8 },  // lunch movement
  { hour: 12, arrivalMultiplier: 0.5, departureMultiplier: 0.6 },
  { hour: 13, arrivalMultiplier: 0.4, departureMultiplier: 0.4 },
  { hour: 14, arrivalMultiplier: 0.3, departureMultiplier: 0.5 },
  { hour: 15, arrivalMultiplier: 0.3, departureMultiplier: 0.6 },
  { hour: 16, arrivalMultiplier: 0.2, departureMultiplier: 1.5 },  // peak out starts
  { hour: 17, arrivalMultiplier: 0.2, departureMultiplier: 2.5 },  // PEAK OUT
  { hour: 18, arrivalMultiplier: 0.15, departureMultiplier: 2.0 },
  { hour: 19, arrivalMultiplier: 0.1, departureMultiplier: 1.0 },
  { hour: 20, arrivalMultiplier: 0.1, departureMultiplier: 0.5 },
  { hour: 21, arrivalMultiplier: 0.05, departureMultiplier: 0.3 },
  { hour: 22, arrivalMultiplier: 0.05, departureMultiplier: 0.2 },
  { hour: 23, arrivalMultiplier: 0.05, departureMultiplier: 0.1 },
];

// ─── Seeded PRNG (Mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class SimulationService {
  private readonly strategies: Map<string, AllocationStrategy>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
  ) {
    this.strategies = new Map<string, AllocationStrategy>([
      ['balanced_occupancy', new BalancedOccupancyStrategy()],
      ['lowest_floor', new LowestFloorStrategy()],
      ['random', new RandomStrategy()],
    ]);
  }

  /**
   * Run a simulation with time-varying arrivals and check-out events.
   */
  async run(dto: RunSimulationDto, userId: string): Promise<SimulationResult> {
    const strategy = this.strategies.get(dto.strategy);
    if (!strategy) {
      const available = Array.from(this.strategies.keys()).join(', ');
      throw new BadRequestException(
        `Invalid strategy: ${dto.strategy}. Available: ${available}`,
      );
    }

    const seed = dto.seed ?? Date.now();
    const rng = mulberry32(seed);
    const fullDayMode = dto.fullDayMode ?? false;
    const meanDuration = dto.meanParkingDurationMinutes ?? 240;
    const startHour = dto.startHour ?? 0;
    const profile = dto.hourlyProfile ?? DEFAULT_HOURLY_PROFILE;

    // Load slot layout into memory
    const dbSlots = await this.prisma.slot.findMany({ include: { floor: true } });
    const simSlots: SimSlot[] = dbSlots.map((s) => ({
      id: s.id,
      floorId: s.floorId,
      floorNumber: s.floor.floorNumber,
      zone: s.zone,
      slotNumber: s.slotNumber,
      code: s.code,
      status: SlotStatus.available,
      vehicleType: s.vehicleType,
      occupiedUntilMinute: null,
      floor: { id: s.floor.id, floorNumber: s.floor.floorNumber, name: s.floor.name },
    }));

    // Generate events
    const events = fullDayMode
      ? this.generateFullDayEvents(dto.durationMinutes, dto.arrivalRatePerMinute, dto.carMotorbikeRatio, meanDuration, startHour, profile, rng)
      : this.generateConstantArrivals(dto.durationMinutes, dto.arrivalRatePerMinute, dto.carMotorbikeRatio, meanDuration, rng);

    // Sort all events by time
    events.sort((a, b) => a.minuteOffset - b.minuteOffset);

    // Run simulation
    let assigned = 0;
    let rejected = 0;
    let totalAllocationTimeMs = 0;
    let totalArrivals = 0;
    const floorCounts = new Map<string, number>();

    // Hourly tracking
    const hourlyData = new Map<number, { arrivals: number; assigned: number; rejected: number; peakOccupied: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyData.set(h, { arrivals: 0, assigned: 0, rejected: 0, peakOccupied: 0 });
    }

    let peakOccupancyRate = 0;
    let peakHour = 0;

    for (const event of events) {
      const currentHour = (startHour + Math.floor(event.minuteOffset / 60)) % 24;

      if (event.type === 'departure') {
        // Free the slot
        const slot = simSlots.find((s) => s.id === event.slotId);
        if (slot && slot.status === SlotStatus.occupied) {
          slot.status = SlotStatus.available;
          slot.occupiedUntilMinute = null;
        }
        continue;
      }

      // Arrival event
      totalArrivals++;
      const hourStats = hourlyData.get(currentHour)!;
      hourStats.arrivals++;

      // Process departures that should have happened by now
      for (const slot of simSlots) {
        if (
          slot.status === SlotStatus.occupied &&
          slot.occupiedUntilMinute !== null &&
          slot.occupiedUntilMinute <= event.minuteOffset
        ) {
          slot.status = SlotStatus.available;
          slot.occupiedUntilMinute = null;
        }
      }

      const startTime = performance.now();

      try {
        const availableSlots = simSlots.filter((s) => s.status === SlotStatus.available);
        const allocatedSlot = strategy.allocate(event.vehicleType, availableSlots, simSlots);

        // Mark slot occupied with departure time
        const simSlot = simSlots.find((s) => s.id === allocatedSlot.id);
        if (simSlot) {
          simSlot.status = SlotStatus.occupied;
          // Parking duration: exponential distribution with mean = meanDuration
          const duration = -meanDuration * Math.log(1 - rng());
          simSlot.occupiedUntilMinute = event.minuteOffset + Math.max(duration, 15); // min 15 min
        }

        assigned++;
        hourStats.assigned++;
        const key = `${allocatedSlot.floorId}-${allocatedSlot.zone}`;
        floorCounts.set(key, (floorCounts.get(key) ?? 0) + 1);
      } catch {
        rejected++;
        hourStats.rejected++;
      }

      totalAllocationTimeMs += performance.now() - startTime;

      // Track occupancy after this event
      const occupiedNow = simSlots.filter((s) => s.status === SlotStatus.occupied).length;
      const currentOccupancy = occupiedNow / simSlots.length;
      if (currentOccupancy > peakOccupancyRate) {
        peakOccupancyRate = currentOccupancy;
        peakHour = currentHour;
      }
      if (occupiedNow > hourStats.peakOccupied) {
        hourStats.peakOccupied = occupiedNow;
      }
    }

    // Final metrics
    const totalSlots = simSlots.length;
    const finalOccupied = simSlots.filter((s) => s.status === SlotStatus.occupied).length;
    const finalOccupancyRate = totalSlots > 0 ? finalOccupied / totalSlots : 0;
    const avgAllocationTimeMs = totalArrivals > 0 ? totalAllocationTimeMs / totalArrivals : 0;

    // Peak hour rejection rate
    const peakHourData = hourlyData.get(peakHour)!;
    const peakHourRejectionRate = peakHourData.arrivals > 0
      ? peakHourData.rejected / peakHourData.arrivals
      : 0;

    // Floor distribution
    const floorDistribution: FloorDistribution[] = [];
    for (const [key, count] of floorCounts) {
      const [floorIdStr, zone] = key.split('-');
      const floorId = parseInt(floorIdStr, 10);
      const floor = simSlots.find((s) => s.floorId === floorId)?.floor;
      floorDistribution.push({
        floorId,
        floorName: floor?.name ?? `Floor ${floorId}`,
        zone,
        assigned: count,
      });
    }
    floorDistribution.sort((a, b) => a.floorId - b.floorId || a.zone.localeCompare(b.zone));

    // Hourly metrics
    const hourlyMetrics: HourlyMetrics[] = [];
    for (let h = 0; h < 24; h++) {
      const data = hourlyData.get(h)!;
      if (data.arrivals > 0 || data.peakOccupied > 0) {
        hourlyMetrics.push({
          hour: h,
          arrivals: data.arrivals,
          assigned: data.assigned,
          rejected: data.rejected,
          occupancyRate: totalSlots > 0
            ? Math.round((data.peakOccupied / totalSlots) * 10000) / 100
            : 0,
        });
      }
    }

    // Persist to SimulationRun
    const modeLabel = fullDayMode ? 'fullday' : 'constant';
    const scenario = `${modeLabel}_${dto.arrivalRatePerMinute}/min_${dto.durationMinutes}min_${Math.round(dto.carMotorbikeRatio * 100)}car`;

    const simRun = await this.prisma.simulationRun.create({
      data: {
        strategy: dto.strategy,
        scenario,
        params: {
          durationMinutes: dto.durationMinutes,
          arrivalRatePerMinute: dto.arrivalRatePerMinute,
          carMotorbikeRatio: dto.carMotorbikeRatio,
          seed,
          fullDayMode,
          meanParkingDurationMinutes: meanDuration,
          startHour,
        },
        seed: BigInt(seed),
        avgSearchTimeMs: avgAllocationTimeMs,
        finalUtilizationRate: Math.round(finalOccupancyRate * 10000) / 100,
        rejectionCount: rejected,
        overflowCount: rejected, // overflow = rejection in this context
        totalVehicles: totalArrivals,
        durationMinutes: dto.durationMinutes,
        createdBy: userId,
      },
    });

    return {
      id: simRun.id,
      strategy: dto.strategy,
      scenario,
      params: {
        durationMinutes: dto.durationMinutes,
        arrivalRatePerMinute: dto.arrivalRatePerMinute,
        carMotorbikeRatio: dto.carMotorbikeRatio,
        seed,
        fullDayMode,
        meanParkingDurationMinutes: meanDuration,
        startHour,
      },
      totalVehicles: totalArrivals,
      totalAssigned: assigned,
      rejected,
      rejectionRate: totalArrivals > 0 ? Math.round((rejected / totalArrivals) * 10000) / 100 : 0,
      avgAllocationTimeMs: Math.round(avgAllocationTimeMs * 1000) / 1000,
      finalOccupancyRate: Math.round(finalOccupancyRate * 10000) / 100,
      peakOccupancyRate: Math.round(peakOccupancyRate * 10000) / 100,
      peakHour,
      peakHourRejectionRate: Math.round(peakHourRejectionRate * 10000) / 100,
      floorDistribution,
      hourlyMetrics,
      durationMinutes: dto.durationMinutes,
    };
  }

  /**
   * Generate full-day events with time-varying arrival rates and departures.
   * Uses hourly profile to modulate base lambda.
   */
  private generateFullDayEvents(
    durationMinutes: number,
    baseLambda: number,
    carRatio: number,
    meanDuration: number,
    startHour: number,
    profile: { hour: number; arrivalMultiplier: number; departureMultiplier: number }[],
    rng: () => number,
  ): SimEvent[] {
    const events: SimEvent[] = [];

    // Generate arrivals hour by hour with varying lambda
    let currentMinute = 0;

    while (currentMinute < durationMinutes) {
      const currentHour = (startHour + Math.floor(currentMinute / 60)) % 24;
      const hourProfile = profile.find((p) => p.hour === currentHour) ?? { arrivalMultiplier: 1, departureMultiplier: 1 };
      const lambda = baseLambda * hourProfile.arrivalMultiplier;

      if (lambda <= 0) {
        // Skip to next minute
        currentMinute += 1;
        continue;
      }

      // Inter-arrival time (exponential)
      const u = rng();
      const interArrival = -Math.log(1 - u) / lambda;
      currentMinute += interArrival;

      if (currentMinute >= durationMinutes) break;

      const vehicleType = rng() < carRatio ? VehicleType.car : VehicleType.motorbike;
      events.push({ minuteOffset: currentMinute, type: 'arrival', vehicleType });
    }

    return events;
  }

  /**
   * Generate constant-rate arrivals (original behavior, backward compatible).
   */
  private generateConstantArrivals(
    durationMinutes: number,
    lambda: number,
    carRatio: number,
    _meanDuration: number,
    rng: () => number,
  ): SimEvent[] {
    const events: SimEvent[] = [];
    let currentMinute = 0;

    while (currentMinute < durationMinutes) {
      const u = rng();
      const interArrival = -Math.log(1 - u) / lambda;
      currentMinute += interArrival;

      if (currentMinute >= durationMinutes) break;

      const vehicleType = rng() < carRatio ? VehicleType.car : VehicleType.motorbike;
      events.push({ minuteOffset: currentMinute, type: 'arrival', vehicleType });
    }

    return events;
  }

  /**
   * List past simulation runs.
   */
  async listRuns(limit: number = 20) {
    return this.prisma.simulationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
