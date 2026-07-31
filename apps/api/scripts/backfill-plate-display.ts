/**
 * One-off backfill for the new plate normalization columns:
 *   vehicles.plate_display         <- toDisplay(plate_number)
 *   parking_sessions.plate_display <- toDisplay(license_plate)
 *   ocr_evidences.{raw,canonical,display}_plate <- derived from rawResponse/ocr_plate
 * Run: npx ts-node scripts/backfill-plate-display.ts   (from apps/api)
 * Imported by verification tests: runBackfill(prisma)
 */
import { PrismaClient } from '@prisma/client';
import { PlateFormatter } from '../src/plates';

export async function runBackfill(prisma: PrismaClient) {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true } });
  for (const v of vehicles) {
    const display = PlateFormatter.toDisplay(PlateFormatter.normalize(v.plateNumber));
    if (display && display !== v.plateNumber) {
      await prisma.vehicle.update({ where: { id: v.id }, data: { plateDisplay: display } });
    }
  }
  console.log(`vehicles backfilled: ${vehicles.length}`);

  const sessions = await prisma.parkingSession.findMany({ select: { id: true, licensePlate: true } });
  for (const s of sessions) {
    const display = PlateFormatter.toDisplay(PlateFormatter.normalize(s.licensePlate));
    if (display && display !== s.licensePlate) {
      await prisma.parkingSession.update({ where: { id: s.id }, data: { plateDisplay: display } });
    }
  }
  console.log(`parking_sessions backfilled: ${sessions.length}`);

  const evidences = await prisma.ocrEvidence.findMany({
    select: { id: true, ocrPlate: true, rawResponse: true },
  });
  for (const e of evidences) {
    const fromResponse =
      (e.rawResponse as { results?: Array<{ plate?: unknown }> } | null)?.results?.[0]?.plate ?? null;
    const raw = typeof fromResponse === 'string' ? fromResponse : e.ocrPlate;
    const parsed = PlateFormatter.parse(raw);
    await prisma.ocrEvidence.update({
      where: { id: e.id },
      data: {
        rawPlate: raw || null,
        canonicalPlate: parsed.canonicalPlate,
        displayPlate: parsed.displayPlate,
      },
    });
  }
  console.log(`ocr_evidences backfilled: ${evidences.length}`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await runBackfill(prisma);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
