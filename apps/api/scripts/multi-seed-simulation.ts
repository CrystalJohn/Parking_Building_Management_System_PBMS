/**
 * Multi-seed simulation — runs 30 seeds per strategy, reports mean ± std.
 * Execute: npx ts-node scripts/multi-seed-simulation.ts
 */

// ─── Inline simulation engine (same as demo-simulation.ts) ───────────────────

type VehicleType = 'car' | 'motorbike';
type SlotStatus = 'available' | 'occupied';
type Zone = 'A' | 'B';

interface SimSlot {
  id: number;
  floorId: number;
  floorNumber: number;
  zone: Zone;
  slotNumber: number;
  status: SlotStatus;
  vehicleType: VehicleType;
  occupiedUntilMinute: number | null;
}

interface SimEvent {
  minuteOffset: number;
  type: 'arrival';
  vehicleType: VehicleType;
}

interface SimResult {
  seed: number;
  totalVehicles: number;
  assigned: number;
  rejected: number;
  rejectionRate: number;
  peakOccupancyRate: number;
  peakHour: number;
  peakHourArrivals: number;
  peakHourRejected: number;
  peakHourRejectionRate: number;
  floorVariance: number;
}

// Seeded PRNG (Mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hourly profile (Vietnam office)
const PROFILE = [
  { hour: 0, m: 0.05 }, { hour: 1, m: 0.02 }, { hour: 2, m: 0.02 },
  { hour: 3, m: 0.02 }, { hour: 4, m: 0.05 }, { hour: 5, m: 0.1 },
  { hour: 6, m: 0.5 },  { hour: 7, m: 2.0 },  { hour: 8, m: 2.5 },
  { hour: 9, m: 1.0 },  { hour: 10, m: 0.6 }, { hour: 11, m: 0.5 },
  { hour: 12, m: 0.5 }, { hour: 13, m: 0.4 }, { hour: 14, m: 0.3 },
  { hour: 15, m: 0.3 }, { hour: 16, m: 0.2 }, { hour: 17, m: 0.2 },
  { hour: 18, m: 0.15 },{ hour: 19, m: 0.1 }, { hour: 20, m: 0.1 },
  { hour: 21, m: 0.05 },{ hour: 22, m: 0.05 },{ hour: 23, m: 0.05 },
];

function createSlots(): SimSlot[] {
  const slots: SimSlot[] = [];
  let id = 1;
  for (let floor = 1; floor <= 3; floor++) {
    for (let i = 1; i <= 10; i++) {
      slots.push({ id: id++, floorId: floor, floorNumber: floor, zone: 'A', slotNumber: i, status: 'available', vehicleType: 'car', occupiedUntilMinute: null });
    }
    for (let i = 1; i <= 20; i++) {
      slots.push({ id: id++, floorId: floor, floorNumber: floor, zone: 'B', slotNumber: i, status: 'available', vehicleType: 'motorbike', occupiedUntilMinute: null });
    }
  }
  return slots;
}

// ─── Strategies ──────────────────────────────────────────────────────────────

function allocateBalanced(vehicleType: VehicleType, slots: SimSlot[]): SimSlot | null {
  const zone: Zone = vehicleType === 'car' ? 'A' : 'B';
  const available = slots.filter(s => s.status === 'available' && s.zone === zone && s.vehicleType === vehicleType);
  if (available.length === 0) return null;

  const floorOcc = new Map<number, { total: number; occ: number }>();
  for (const s of slots) {
    if (s.zone !== zone || s.vehicleType !== vehicleType) continue;
    if (!floorOcc.has(s.floorId)) floorOcc.set(s.floorId, { total: 0, occ: 0 });
    const f = floorOcc.get(s.floorId)!;
    f.total++;
    if (s.status === 'occupied') f.occ++;
  }

  available.sort((a, b) => {
    const occA = (floorOcc.get(a.floorId)?.occ ?? 0) / (floorOcc.get(a.floorId)?.total ?? 1);
    const occB = (floorOcc.get(b.floorId)?.occ ?? 0) / (floorOcc.get(b.floorId)?.total ?? 1);
    if (occA !== occB) return occA - occB;
    if (a.floorNumber !== b.floorNumber) return a.floorNumber - b.floorNumber;
    return a.slotNumber - b.slotNumber;
  });
  return available[0];
}

function allocateLowestFloor(vehicleType: VehicleType, slots: SimSlot[]): SimSlot | null {
  const zone: Zone = vehicleType === 'car' ? 'A' : 'B';
  const available = slots.filter(s => s.status === 'available' && s.zone === zone && s.vehicleType === vehicleType);
  if (available.length === 0) return null;
  available.sort((a, b) => a.floorNumber !== b.floorNumber ? a.floorNumber - b.floorNumber : a.slotNumber - b.slotNumber);
  return available[0];
}

function allocateRandom(vehicleType: VehicleType, slots: SimSlot[], rng: () => number): SimSlot | null {
  const zone: Zone = vehicleType === 'car' ? 'A' : 'B';
  const available = slots.filter(s => s.status === 'available' && s.zone === zone && s.vehicleType === vehicleType);
  if (available.length === 0) return null;
  return available[Math.floor(rng() * available.length)];
}

// ─── Simulation Runner ───────────────────────────────────────────────────────

function runSim(strategyName: string, seed: number): SimResult {
  const rng = mulberry32(seed);
  const slots = createSlots();
  const durationMinutes = 1440;
  const baseLambda = 0.6; // higher load to stress-test
  const carRatio = 0.33;
  const meanDuration = 240;

  // Generate arrivals
  const events: SimEvent[] = [];
  let currentMinute = 0;
  while (currentMinute < durationMinutes) {
    const hour = Math.floor(currentMinute / 60) % 24;
    const lambda = baseLambda * (PROFILE[hour]?.m ?? 0.1);
    if (lambda <= 0) { currentMinute += 1; continue; }
    const u = rng();
    currentMinute += -Math.log(1 - u) / lambda;
    if (currentMinute >= durationMinutes) break;
    const vehicleType: VehicleType = rng() < carRatio ? 'car' : 'motorbike';
    events.push({ minuteOffset: currentMinute, type: 'arrival', vehicleType });
  }

  // Process events
  let assigned = 0, rejected = 0;
  const hourlyStats = Array.from({ length: 24 }, () => ({ arrivals: 0, assigned: 0, rejected: 0, peakOccupied: 0 }));
  const floorAssigned = new Map<number, number>(); // floorId → count
  let peakOcc = 0, peakHour = 0;

  for (const event of events) {
    const hour = Math.floor(event.minuteOffset / 60) % 24;

    // Process departures
    for (const s of slots) {
      if (s.status === 'occupied' && s.occupiedUntilMinute !== null && s.occupiedUntilMinute <= event.minuteOffset) {
        s.status = 'available';
        s.occupiedUntilMinute = null;
      }
    }

    hourlyStats[hour].arrivals++;

    let slot: SimSlot | null = null;
    if (strategyName === 'balanced_occupancy') slot = allocateBalanced(event.vehicleType, slots);
    else if (strategyName === 'lowest_floor') slot = allocateLowestFloor(event.vehicleType, slots);
    else slot = allocateRandom(event.vehicleType, slots, rng);

    if (slot) {
      slot.status = 'occupied';
      const dur = -meanDuration * Math.log(1 - rng());
      slot.occupiedUntilMinute = event.minuteOffset + Math.max(dur, 15);
      assigned++;
      hourlyStats[hour].assigned++;
      floorAssigned.set(slot.floorId, (floorAssigned.get(slot.floorId) ?? 0) + 1);
    } else {
      rejected++;
      hourlyStats[hour].rejected++;
    }

    const occ = slots.filter(s => s.status === 'occupied').length / slots.length;
    if (occ > peakOcc) { peakOcc = occ; peakHour = hour; }
    const occCount = slots.filter(s => s.status === 'occupied').length;
    if (occCount > hourlyStats[hour].peakOccupied) hourlyStats[hour].peakOccupied = occCount;
  }

  // Find peak hour by arrivals (for consistent comparison)
  let maxArrivalsHour = 0;
  let maxArrivals = 0;
  for (let h = 0; h < 24; h++) {
    if (hourlyStats[h].arrivals > maxArrivals) {
      maxArrivals = hourlyStats[h].arrivals;
      maxArrivalsHour = h;
    }
  }

  const peakStats = hourlyStats[maxArrivalsHour];
  const peakHourRejectionRate = peakStats.arrivals > 0 ? peakStats.rejected / peakStats.arrivals : 0;

  // Floor variance (Zone B motorbike — largest zone)
  const floorCounts = [1, 2, 3].map(f => floorAssigned.get(f) ?? 0);
  const mean = floorCounts.reduce((s, v) => s + v, 0) / 3;
  const variance = floorCounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / 3;

  return {
    seed,
    totalVehicles: events.length,
    assigned,
    rejected,
    rejectionRate: events.length > 0 ? rejected / events.length : 0,
    peakOccupancyRate: peakOcc,
    peakHour,
    peakHourArrivals: peakStats.arrivals,
    peakHourRejected: peakStats.rejected,
    peakHourRejectionRate,
    floorVariance: variance,
  };
}

// ─── Statistics helpers ──────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
}

function ci95(arr: number[]): number {
  // 95% confidence interval half-width (z=1.96)
  return 1.96 * std(arr) / Math.sqrt(arr.length);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const NUM_SEEDS = 30;
const STRATEGIES = ['balanced_occupancy', 'lowest_floor', 'random'];

console.log('='.repeat(90));
console.log(`MULTI-SEED SIMULATION — ${NUM_SEEDS} seeds per strategy`);
console.log('Params: 24h, 90 slots, 0.6/min base rate, 33% car, mean parking 4h, Vietnam office profile');
console.log('='.repeat(90));

const allResults: Record<string, SimResult[]> = {};

for (const strategy of STRATEGIES) {
  const results: SimResult[] = [];
  for (let i = 0; i < NUM_SEEDS; i++) {
    const seed = 1000 + i * 7; // deterministic spread of seeds
    results.push(runSim(strategy, seed));
  }
  allResults[strategy] = results;
}

// ─── Summary Table ───────────────────────────────────────────────────────────

console.log('\n');
console.log('┌─────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────┐');
console.log('│ Metric                  │ balanced_occupancy     │ lowest_floor           │ random                 │');
console.log('├─────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────┤');

const metrics: { label: string; extract: (r: SimResult) => number; format: (m: number, s: number, c: number) => string }[] = [
  {
    label: 'Total vehicles',
    extract: r => r.totalVehicles,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
  {
    label: 'Assigned',
    extract: r => r.assigned,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
  {
    label: 'Rejected',
    extract: r => r.rejected,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
  {
    label: 'Rejection rate (%)',
    extract: r => r.rejectionRate * 100,
    format: (m, s, c) => `${m.toFixed(2)} ± ${c.toFixed(2)}`,
  },
  {
    label: 'Peak occupancy (%)',
    extract: r => r.peakOccupancyRate * 100,
    format: (m, s, c) => `${m.toFixed(1)} ± ${c.toFixed(1)}`,
  },
  {
    label: 'Peak hr arrivals',
    extract: r => r.peakHourArrivals,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
  {
    label: 'Peak hr rejected',
    extract: r => r.peakHourRejected,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
  {
    label: 'Peak hr reject % ',
    extract: r => r.peakHourRejectionRate * 100,
    format: (m, s, c) => `${m.toFixed(2)} ± ${c.toFixed(2)}`,
  },
  {
    label: 'Floor variance',
    extract: r => r.floorVariance,
    format: (m, s, _c) => `${m.toFixed(1)} ± ${s.toFixed(1)}`,
  },
];

for (const metric of metrics) {
  const cols = STRATEGIES.map(strategy => {
    const values = allResults[strategy].map(metric.extract);
    const m = mean(values);
    const s = std(values);
    const c = ci95(values);
    return metric.format(m, s, c).padEnd(22);
  });
  console.log(`│ ${metric.label.padEnd(23)} │ ${cols[0]} │ ${cols[1]} │ ${cols[2]} │`);
}

console.log('└─────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────┘');

// ─── Statistical Significance ────────────────────────────────────────────────

console.log('\n');
console.log('─── Statistical Comparison (Peak Hour Rejection Rate) ───');
console.log('');

const balancedPeakRej = allResults['balanced_occupancy'].map(r => r.peakHourRejectionRate * 100);
const lowestPeakRej = allResults['lowest_floor'].map(r => r.peakHourRejectionRate * 100);
const randomPeakRej = allResults['random'].map(r => r.peakHourRejectionRate * 100);

console.log(`balanced_occupancy: mean=${mean(balancedPeakRej).toFixed(2)}%, std=${std(balancedPeakRej).toFixed(2)}%, 95%CI=[${(mean(balancedPeakRej) - ci95(balancedPeakRej)).toFixed(2)}, ${(mean(balancedPeakRej) + ci95(balancedPeakRej)).toFixed(2)}]`);
console.log(`lowest_floor:       mean=${mean(lowestPeakRej).toFixed(2)}%, std=${std(lowestPeakRej).toFixed(2)}%, 95%CI=[${(mean(lowestPeakRej) - ci95(lowestPeakRej)).toFixed(2)}, ${(mean(lowestPeakRej) + ci95(lowestPeakRej)).toFixed(2)}]`);
console.log(`random:             mean=${mean(randomPeakRej).toFixed(2)}%, std=${std(randomPeakRej).toFixed(2)}%, 95%CI=[${(mean(randomPeakRej) - ci95(randomPeakRej)).toFixed(2)}, ${(mean(randomPeakRej) + ci95(randomPeakRej)).toFixed(2)}]`);

console.log('');
const diffBalancedVsRandom = mean(randomPeakRej) - mean(balancedPeakRej);
const diffLowestVsRandom = mean(randomPeakRej) - mean(lowestPeakRej);
console.log(`Improvement (balanced vs random):     ${diffBalancedVsRandom.toFixed(2)} percentage points`);
console.log(`Improvement (lowest_floor vs random): ${diffLowestVsRandom.toFixed(2)} percentage points`);

// Check if CIs overlap (simple significance test)
const balancedUpper = mean(balancedPeakRej) + ci95(balancedPeakRej);
const randomLower = mean(randomPeakRej) - ci95(randomPeakRej);
const significant = balancedUpper < randomLower;
console.log(`\n95% CI overlap (balanced vs random): ${significant ? 'NO OVERLAP → Statistically significant' : 'OVERLAP → May not be significant (need t-test)'}`);

// ─── Floor Distribution Comparison ──────────────────────────────────────────

console.log('\n');
console.log('─── Floor Distribution Variance (lower = more balanced) ───');
console.log('');
for (const strategy of STRATEGIES) {
  const variances = allResults[strategy].map(r => r.floorVariance);
  console.log(`${strategy.padEnd(20)}: mean=${mean(variances).toFixed(1)}, std=${std(variances).toFixed(1)}`);
}

console.log('\n' + '='.repeat(90));
console.log('DONE — 30 seeds × 3 strategies = 90 simulation runs');
