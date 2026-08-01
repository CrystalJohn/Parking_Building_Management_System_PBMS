export type PlateKind = 'car' | 'motorbike' | null;
export type PlateFormatStatus = 'OK' | 'PARTIAL' | 'INVALID';

export interface PlateFormatResult {
  rawPlate: string;
  canonicalPlate: string | null;
  displayPlate: string | null;
  kind: PlateKind;
  status: PlateFormatStatus;
}

const CAR_PATTERN = /^\d{2}[A-Z]\d{5}$/;
const MOTORCYCLE_PATTERN = /^\d{2}[A-Z]\d\d{5}$/;

export function normalize(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function toDisplay(canonical: string): string | null {
  if (CAR_PATTERN.test(canonical)) {
    return `${canonical.slice(0, 3)}-${canonical.slice(3, 6)}.${canonical.slice(6)}`;
  }
  if (MOTORCYCLE_PATTERN.test(canonical)) {
    return `${canonical.slice(0, 2)}-${canonical.slice(2, 4)} ${canonical.slice(4, 7)}.${canonical.slice(7)}`;
  }
  return null;
}

export function inferKind(canonical: string): PlateKind {
  if (!canonical) return null;
  if (MOTORCYCLE_PATTERN.test(canonical)) return 'motorbike';
  if (CAR_PATTERN.test(canonical)) return 'car';
  return null;
}

export function parse(raw: string | null | undefined): PlateFormatResult {
  const rawPlate = raw ?? '';
  const canonicalPlate = normalize(rawPlate);
  const displayPlate = canonicalPlate ? toDisplay(canonicalPlate) : null;
  return {
    rawPlate,
    canonicalPlate: canonicalPlate || null,
    displayPlate,
    kind: displayPlate ? inferKind(canonicalPlate) : null,
    status: displayPlate ? 'OK' : canonicalPlate ? 'PARTIAL' : 'INVALID',
  };
}

export const PlateFormatter = { normalize, toDisplay, parse, inferKind };
