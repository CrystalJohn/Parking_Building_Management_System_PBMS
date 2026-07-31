import { PlateFormatter, inferKind, normalize, parse, toDisplay } from './plate-formatter';

describe('PlateFormatter.normalize', () => {
  it('uppercases and strips separators', () => {
    expect(normalize('30a-123.45')).toBe('30A12345');
    expect(normalize(' 59X3 456.78 ')).toBe('59X345678');
    expect(normalize('59-X1 234.56')).toBe('59X123456');
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });

  it('matches the exact behavior of the legacy normalizePlateNumber', () => {
    expect(normalize('90b2-452.30')).toBe('90B245230');
    expect(normalize('29K6-447.43')).toBe('29K644743');
  });
});

describe('PlateFormatter.toDisplay', () => {
  it('formats car plates (8 chars: XXA-123.45)', () => {
    expect(toDisplay('30A12345')).toBe('30A-123.45');
    expect(toDisplay('51K99999')).toBe('51K-999.99');
  });

  it('formats motorbike plates (9 chars: XXLd-456.78)', () => {
    expect(toDisplay('59X345678')).toBe('59X3-456.78');
    expect(toDisplay('29K644743')).toBe('29K6-447.43');
  });

  it('returns null for non-standard patterns', () => {
    expect(toDisplay('ABC')).toBeNull();
    expect(toDisplay('30A1234567')).toBeNull();
    expect(toDisplay('29A1234')).toBeNull(); // old 4-digit car plate: PARTIAL, no display
    expect(toDisplay('')).toBeNull();
  });
});

describe('PlateFormatter.inferKind', () => {
  it('infers car vs motorbike from pattern only', () => {
    expect(inferKind('30A12345')).toBe('car');
    expect(inferKind('59X345678')).toBe('motorbike');
    expect(inferKind('ABC')).toBeNull();
    expect(inferKind('')).toBeNull();
  });
});

describe('PlateFormatter.parse', () => {
  it('produces raw/canonical/display for a full read', () => {
    expect(parse('30a12345')).toEqual({
      rawPlate: '30a12345',
      canonicalPlate: '30A12345',
      displayPlate: '30A-123.45',
      kind: 'car',
      status: 'OK',
    });
  });

  it('marks partial reads with no display', () => {
    expect(parse('30A12?45')).toEqual({
      rawPlate: '30A12?45',
      canonicalPlate: '30A1245',
      displayPlate: null,
      kind: null,
      status: 'PARTIAL',
    });
  });

  it('marks empty input as INVALID', () => {
    expect(parse('')).toEqual({
      rawPlate: '',
      canonicalPlate: null,
      displayPlate: null,
      kind: null,
      status: 'INVALID',
    });
  });

  it('object form matches named exports', () => {
    expect(PlateFormatter.normalize).toBe(normalize);
    expect(PlateFormatter.toDisplay).toBe(toDisplay);
    expect(PlateFormatter.parse).toBe(parse);
    expect(PlateFormatter.inferKind).toBe(inferKind);
  });
});
