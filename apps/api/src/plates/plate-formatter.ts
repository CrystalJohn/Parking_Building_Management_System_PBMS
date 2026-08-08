export type PlateKind = 'car' | 'motorbike' | null;
export type PlateFormatStatus = 'OK' | 'PARTIAL' | 'INVALID';

export interface PlateFormatResult {
  rawPlate: string;
  canonicalPlate: string | null;
  displayPlate: string | null;
  kind: PlateKind;
  status: PlateFormatStatus;
}

export function normalize(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function toDisplay(raw: string): string | null {
  if (!raw) return null;
  const str = String(raw).trim().toUpperCase();

  // 1. Structured input with spaces, dashes, or newlines (e.g. '99-F1 7777', '99-F1\n7777', '99F1 7777', '99-F1-7777')
  const mbStructured4 = str.match(/^(\d{2})[- ]?([A-Z]\d|[A-Z]{2})[\n\- ]+(\d{4})$/);
  if (mbStructured4) {
    return `${mbStructured4[1]}-${mbStructured4[2]} ${mbStructured4[3]}`;
  }

  const mbStructured5 = str.match(/^(\d{2})[- ]?([A-Z]\d|[A-Z]{2})[\n\- ]+(\d{3})[.]?(\d{2})$/);
  if (mbStructured5) {
    return `${mbStructured5[1]}-${mbStructured5[2]} ${mbStructured5[3]}.${mbStructured5[4]}`;
  }

  const carStructured5 = str.match(/^(\d{2}[A-Z]{1,2})[\n\- ]+(\d{3})[.]?(\d{2})$/);
  if (carStructured5) {
    return `${carStructured5[1]}-${carStructured5[2]}.${carStructured5[3]}`;
  }

  const carStructured4 = str.match(/^(\d{2}[A-Z])[\n\- ]+(\d{4})$/);
  if (carStructured4) {
    return `${carStructured4[1]}-${carStructured4[2]}`;
  }

  // 2. Canonical strings (letters and digits only)
  const clean = normalize(raw);
  if (!clean) return null;

  // 2a. Length 9:
  if (clean.length === 9) {
    // Car with 2-letter series (e.g. 51LD-123.45, 29KT-123.45)
    const carSpecial = clean.match(/^(\d{2}(?:LD|KT|DA|CD|NG|NN|CV))(\d{3})(\d{2})$/);
    if (carSpecial) {
      return `${carSpecial[1]}-${carSpecial[2]}.${carSpecial[3]}`;
    }

    // Motorbike 5-digit: 99-E1 222.68, 59-A1 234.56, 29-H1 123.45, 59-AA 123.45
    const mb5 = clean.match(/^(\d{2})([A-Z]\d|[A-Z]{2})(\d{3})(\d{2})$/);
    if (mb5) {
      return `${mb5[1]}-${mb5[2]} ${mb5[3]}.${mb5[4]}`;
    }
  }

  // 2b. Length 8:
  if (clean.length === 8) {
    // Motorbike 4-digit old: 99-F1 7777, 99-E1 2226, 29-H1 1234, 59-AA 1234
    const mb4 = clean.match(/^(\d{2})([A-Z]\d|[A-Z]{2})(\d{4})$/);
    if (mb4 && !isCarSpecialSeries(mb4[2])) {
      return `${mb4[1]}-${mb4[2]} ${mb4[3]}`;
    }

    // Car standard 5-digit: 30A-123.45, 51F-567.89, 60A-888.88
    const car5 = clean.match(/^(\d{2}[A-Z])(\d{3})(\d{2})$/);
    if (car5) {
      return `${car5[1]}-${car5[2]}.${car5[3]}`;
    }
  }

  // 2c. Length 7:
  if (clean.length === 7) {
    // Car 4-digit old: 30A-1234
    const car4 = clean.match(/^(\d{2}[A-Z])(\d{4})$/);
    if (car4) {
      return `${car4[1]}-${car4[2]}`;
    }
  }

  return clean;
}

function isCarSpecialSeries(series: string): boolean {
  // Special 2-letter car series in Vietnam: LD (joint venture), KT (military economic), DA (project), CD (police), etc.
  return /^(?:LD|KT|DA|CD|NG|NN|CV)$/i.test(series);
}

export function inferKind(canonical: string): PlateKind {
  if (!canonical) return null;
  const clean = normalize(canonical);
  if (!clean) return null;

  // Motorbike patterns: province (2 digits) + series (1 letter + 1 digit OR 2 letters not in car special series) + 4-5 digits
  const mbMatch = clean.match(/^(\d{2})([A-Z]\d|[A-Z]{2})\d{4,5}$/);
  if (mbMatch && !isCarSpecialSeries(mbMatch[2])) {
    return 'motorbike';
  }

  // Car patterns: province (2 digits) + series (1 letter OR car special series) + 4-5 digits
  if (/^\d{2}[A-Z]{1,2}\d{4,5}$/.test(clean)) {
    return 'car';
  }

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
