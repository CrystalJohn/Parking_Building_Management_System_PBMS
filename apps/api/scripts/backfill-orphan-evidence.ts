/**
 * Gate v1.6 – Backfill Orphan OCR Evidence Script
 *
 * Links orphaned check_in OcrEvidence records to their matching ParkingSession
 * using the same scoring algorithm as the live auto-reconciliation flow.
 *
 * Scoring (plate match is REQUIRED):
 *   +2  cameraId matches session staff's gate lane cameraId
 *   +1  vehicleType matches
 *   tiebreaker: closest capturedAt to checkInTime
 *
 * Ambiguous matches (multiple candidates with equal top score) are NOT auto-linked.
 * They are logged as AMBIGUOUS_MATCH for manual admin review.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-orphan-evidence.ts --dry-run   ← preview only
 *   pnpm tsx scripts/backfill-orphan-evidence.ts             ← apply changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');
const WINDOW_MS = 5 * 60 * 1000; // ±5 minutes for backfill (wider than live ±2 min)

interface Candidate {
  id: string;
  capturedAt: Date;
  cameraId: string | null;
  vehicleType: string | null;
  score: number;
  matchedBy: string[];
  timeDeltaSeconds: number;
}

async function run() {
  console.log(`\n========== Backfill Orphan Evidence Script ==========`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be written)' : 'LIVE (changes will be written)'}`);
  console.log(`Time window: ±${WINDOW_MS / 60000} minutes\n`);

  // Overall counts
  const totalEvidences = await prisma.ocrEvidence.count();
  const totalOrphans = await prisma.ocrEvidence.count({ where: { sessionId: null } });

  const totalSessions = await prisma.parkingSession.count();
  const sessionsMissingEvidence = await prisma.parkingSession.count({
    where: { ocrEvidences: { none: { eventType: 'check_in' } } },
  });

  console.log(`Total OCR evidence records: ${totalEvidences}`);
  console.log(`Total orphan evidences:     ${totalOrphans}`);
  console.log(`Total sessions:             ${totalSessions}`);
  console.log(`Sessions missing evidence:  ${sessionsMissingEvidence}\n`);

  // Find sessions missing check_in evidence
  const sessions = await prisma.parkingSession.findMany({
    where: { ocrEvidences: { none: { eventType: 'check_in' } } },
    select: {
      id: true,
      licensePlate: true,
      vehicleType: true,
      checkInTime: true,
      identificationMethod: true,
    },
  });

  let autoLinked = 0;
  let ambiguous = 0;
  let unrecoverable = 0;
  const ambiguousLog: Array<{ sessionId: string; plate: string; candidateIds: string[] }> = [];

  for (const session of sessions) {
    // Skip manual-entry sessions — they intentionally have no evidence
    if (session.identificationMethod === 'MANUAL_PLATE') {
      unrecoverable++;
      continue;
    }

    const candidates = await prisma.ocrEvidence.findMany({
      where: {
        sessionId: null,
        eventType: 'check_in',
        canonicalPlate: session.licensePlate,
        capturedAt: {
          gte: new Date(session.checkInTime.getTime() - WINDOW_MS),
          lte: new Date(session.checkInTime.getTime() + WINDOW_MS),
        },
      },
      select: { id: true, capturedAt: true, cameraId: true, vehicleType: true },
      orderBy: { capturedAt: 'desc' },
    });

    if (candidates.length === 0) {
      unrecoverable++;
      continue;
    }

    // Score each candidate
    const scored: Candidate[] = candidates.map((c) => {
      let score = 0;
      const matchedBy: string[] = ['plate'];
      // Note: for backfill we don't have staff lane context, so lane score is skipped
      if (c.vehicleType === session.vehicleType) { score += 1; matchedBy.push('vehicleType'); }
      const timeDeltaSeconds = Math.round(
        Math.abs(c.capturedAt.getTime() - session.checkInTime.getTime()) / 1000,
      );
      matchedBy.push('timestamp');
      return { ...c, score, matchedBy, timeDeltaSeconds };
    });

    // Sort: highest score first, then closest timestamp
    scored.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.timeDeltaSeconds - b.timeDeltaSeconds,
    );

    const topScore = scored[0].score;
    const topCandidates = scored.filter((c) => c.score === topScore);

    if (topCandidates.length > 1) {
      // Ambiguous — do NOT auto-link
      ambiguous++;
      const entry = {
        sessionId: session.id,
        plate: session.licensePlate,
        candidateIds: topCandidates.map((c) => c.id),
      };
      ambiguousLog.push(entry);
      console.log(`[AMBIGUOUS] Session ${session.id} (${session.licensePlate}) — ${topCandidates.length} equal-score candidates: ${entry.candidateIds.join(', ')}`);
      continue;
    }

    // Single winner
    const winner = topCandidates[0];
    if (!isDryRun) {
      await prisma.ocrEvidence.update({
        where: { id: winner.id },
        data: {
          sessionId: session.id,
          autoReconciled: true,
          checkInTime: session.checkInTime,
        },
      });
      console.log(`[LINKED]    Session ${session.id} (${session.licensePlate}) -> Evidence ${winner.id} | score=${winner.score}, Δt=${winner.timeDeltaSeconds}s | matchedBy=${winner.matchedBy.join(',')}`);
    } else {
      console.log(`[DRY-LINK]  Session ${session.id} (${session.licensePlate}) -> Evidence ${winner.id} | score=${winner.score}, Δt=${winner.timeDeltaSeconds}s | matchedBy=${winner.matchedBy.join(',')}`);
    }
    autoLinked++;
  }

  console.log(`\n--- Backfill Report ---`);
  console.log(`Sessions checked:       ${sessions.length}`);
  console.log(`Total orphan evidences: ${totalOrphans}`);
  console.log(`Sessions missing evid.: ${sessionsMissingEvidence}`);
  console.log(`Auto-link candidates:   ${autoLinked}`);
  console.log(`Ambiguous candidates:   ${ambiguous}`);
  console.log(`Unrecoverable:          ${unrecoverable}`);

  if (ambiguousLog.length > 0) {
    console.log(`\n--- Ambiguous Matches Requiring Manual Review ---`);
    for (const entry of ambiguousLog) {
      console.log(`  Session ${entry.sessionId} (${entry.plate}): candidates=[${entry.candidateIds.join(', ')}]`);
    }
  }

  if (isDryRun) {
    console.log(`\n[DRY RUN COMPLETE] No changes written. Run without --dry-run to apply.`);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
