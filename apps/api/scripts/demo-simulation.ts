/**
 * Standalone simulation demo — runs in-memory without DB.
 * Execute: npx ts-node scripts/demo-simulation.ts
 */

// ─── Inline types and logic (extracted from simulation.service.ts) ───────────

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
  type: 'arrival' | 'departure';
  vehicleType: VehicleType;
}

// Seeded PRNG
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Default hourly profile (Vietnam office)
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

// Create 90 slots (3 floors x 10 car + 20 motorbike)
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

// Strategies
function allocateBalanced(vehicleType: VehicleType, slots: SimSlot[]): SimSlot | null {
  const zone: Zone = vehicleType === 'car' ? 'A' : 'B';
  const available = slots.filter(s => s.status === 'available' && s.zone === zone && s.vehicleType === vehicleType);
  if (available.length === 0) return null;

  // Calculate occupancy per floor
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

// Run simulation
function runSim(strategyName: string, seed: number) {
  const rng = mulberry32(seed);
  const slots = createSlots();
  const durationMinutes = 1440; // 24h
  const baseLambda = 0.4; // base arrivals/min — realistic for 90-slot building
  const carRatio = 0.33;
  const meanDuration = 240; // 4h mean parking
  const startHour = 0;

  // Generate arrivals
  const events: SimEvent[] = [];
  let currentMinute = 0;
  while (currentMinute < durationMinutes) {
    const hour = (startHour + Math.floor(currentMinute / 60)) % 24;
    const lambda = baseLambda * (PROFILE[hour]?.m ?? 0.1);
    if (lambda <= 0) { currentMinute += 1; continue; }
    const u = rng();
    currentMinute += -Math.log(1 - u) / lambda;
    if (currentMinute >= durationMinutes) break;
    const vehicleType: VehicleType = rng() < carRatio ? 'car' : 'motorbike';
    events.push({ minuteOffset: currentMinute, type: 'arrival', vehicleType });
  }

  // Process
  let assigned = 0, rejected = 0;
  const hourlyStats = Array.from({ length: 24 }, () => ({ arrivals: 0, assigned: 0, rejected: 0, peakOccupied: 0 }));
  const floorCounts = new Map<string, number>();
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
      const key = `T${slot.floorNumber}-${slot.zone}`;
      floorCounts.set(key, (floorCounts.get(key) ?? 0) + 1);
    } else {
      rejected++;
      hourlyStats[hour].rejected++;
    }

    const occ = slots.filter(s => s.status === 'occupied').length / slots.length;
    if (occ > peakOcc) { peakOcc = occ; peakHour = hour; }
    if (slots.filter(s => s.status === 'occupied').length > hourlyStats[hour].peakOccupied) {
      hourlyStats[hour].peakOccupied = slots.filter(s => s.status === 'occupied').length;
    }
  }

  return {
    strategy: strategyName,
    totalVehicles: events.length,
    assigned,
    rejected,
    rejectionRate: `${(rejected / events.length * 100).toFixed(2)}%`,
    finalOccupancyRate: `${(slots.filter(s => s.status === 'occupied').length / slots.length * 100).toFixed(1)}%`,
    peakOccupancyRate: `${(peakOcc * 100).toFixed(1)}%`,
    peakHour: `${peakHour}:00`,
    peakHourRejectionRate: `${hourlyStats[peakHour].arrivals > 0 ? (hourlyStats[peakHour].rejected / hourlyStats[peakHour].arrivals * 100).toFixed(1) : 0}%`,
    floorDistribution: Object.fromEntries(floorCounts),
    hourlyHighlights: hourlyStats
      .map((h, i) => ({ hour: i, ...h }))
      .filter(h => h.arrivals > 0)
      .map(h => `  ${String(h.hour).padStart(2, '0')}:00 | arrivals: ${String(h.arrivals).padStart(3)} | assigned: ${String(h.assigned).padStart(3)} | rejected: ${String(h.rejected).padStart(2)} | peak occ: ${((h.peakOccupied / 90) * 100).toFixed(0)}%`),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('='.repeat(80));
console.log('PARKING SIMULATION — Full Day (24h), 90 slots, seed=42');
console.log('Base rate: 0.4 arrivals/min, 33% car / 67% motorbike, mean parking: 4h');
console.log('Building capacity: 90 slots (30 car + 60 motorbike)');
console.log('='.repeat(80));

const SEED = 42;

for (const strategy of ['balanced_occupancy', 'lowest_floor', 'random']) {
  const result = runSim(strategy, SEED);
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Strategy: ${result.strategy.toUpperCase()}`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Total vehicles:         ${result.totalVehicles}`);
  console.log(`Assigned:               ${result.assigned}`);
  console.log(`Rejected:               ${result.rejected} (${result.rejectionRate})`);
  console.log(`Final occupancy:        ${result.finalOccupancyRate}`);
  console.log(`Peak occupancy:         ${result.peakOccupancyRate} at ${result.peakHour}`);
  console.log(`Peak hour rejection:    ${result.peakHourRejectionRate}`);
  console.log(`Floor distribution:     ${JSON.stringify(result.floorDistribution)}`);
  console.log(`\nHourly breakdown:`);
  console.log(`  Hour  | Arrivals | Assigned | Rejected | Peak Occ`);
  for (const line of result.hourlyHighlights) {
    console.log(line);
  }
}

console.log(`\n${'='.repeat(80)}`);
console.log('DONE');
