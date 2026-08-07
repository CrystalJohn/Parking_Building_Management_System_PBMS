import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const totalEvidences = await prisma.ocrEvidence.count();
  const orphanedAll = await prisma.ocrEvidence.count({ where: { sessionId: null } });
  const linkedAll = await prisma.ocrEvidence.count({ where: { sessionId: { not: null } } });
  const orphanedCheckin = await prisma.ocrEvidence.count({ where: { sessionId: null, eventType: 'check_in' } });
  const linkedCheckin = await prisma.ocrEvidence.count({ where: { sessionId: { not: null }, eventType: 'check_in' } });

  const totalSessions = await prisma.parkingSession.count();
  const sessionsMissingEvidence = await prisma.parkingSession.count({
    where: {
      ocrEvidences: { none: { eventType: 'check_in' } }
    }
  });

  // Recoverable: sessions missing evidence where an orphan exists within 5 min window
  const sessions = await prisma.parkingSession.findMany({
    where: { ocrEvidences: { none: { eventType: 'check_in' } } },
    select: { id: true, licensePlate: true, checkInTime: true },
  });

  let recoverableCount = 0;
  let ambiguousCount = 0;

  for (const session of sessions) {
    const fiveMin = 5 * 60 * 1000;
    const candidates = await prisma.ocrEvidence.count({
      where: {
        sessionId: null,
        eventType: 'check_in',
        canonicalPlate: session.licensePlate,
        capturedAt: {
          gte: new Date(session.checkInTime.getTime() - fiveMin),
          lte: new Date(session.checkInTime.getTime() + fiveMin),
        },
      },
    });

    if (candidates === 1) recoverableCount++;
    if (candidates > 1) ambiguousCount++;
  }

  console.log('\n========== OCR Evidence Integrity Report ==========');
  console.log(`Total OCR evidence records:      ${totalEvidences}`);
  console.log(`  - Orphaned (no session):       ${orphanedAll}`);
  console.log(`  - Linked (has session):        ${linkedAll}`);
  console.log(`  - Orphaned check_in evidences: ${orphanedCheckin}`);
  console.log(`  - Linked check_in evidences:   ${linkedCheckin}`);
  console.log('');
  console.log(`Total parking sessions:          ${totalSessions}`);
  console.log(`Sessions missing check_in evid.: ${sessionsMissingEvidence}`);
  console.log('');
  console.log('--- Backfill Impact (±5 min window, plate-only match) ---');
  console.log(`Recoverable sessions:            ${recoverableCount}`);
  console.log(`Ambiguous (multiple candidates): ${ambiguousCount}`);
  console.log(`Unrecoverable (no match):        ${sessionsMissingEvidence - recoverableCount - ambiguousCount}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
