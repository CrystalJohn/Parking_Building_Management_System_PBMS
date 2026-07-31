import { matchPlate, similarity } from './plate-match';

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('43A27206', '43A27206')).toBe(1);
  });

  it('returns high similarity for OCR confusion pairs', () => {
    // classic OCR confusion: 6 vs 8
    expect(similarity('43A27206', '43A27208')).toBeGreaterThan(0.8);
    expect(similarity('43A27206', '43A27208')).toBeLessThan(1);
  });

  it('returns 0 for completely different plates', () => {
    expect(similarity('30A12345', '59X345678')).toBeLessThan(0.3);
  });

  it('normalizes both inputs before comparing', () => {
    expect(similarity('43a-272.06', '43A27206')).toBe(1);
  });
});

describe('matchPlate', () => {
  it('picks the best canonical match above threshold', () => {
    const result = matchPlate('43A27206', ['30A12345', '43A27208', '43A27206']);
    expect(result?.canonicalPlate).toBe('43A27206');
    expect(result?.similarity).toBe(1);
  });

  it('returns null below threshold', () => {
    const result = matchPlate('43A27206', ['59X345678'], 0.8);
    expect(result).toBeNull();
  });

  it('carries the raw plate through', () => {
    const result = matchPlate('43a-272.06', ['43A27206']);
    expect(result?.rawPlate).toBe('43a-272.06');
  });
});
