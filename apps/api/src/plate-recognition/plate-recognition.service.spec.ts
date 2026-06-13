import { formatVietnamesePlate } from './plate-recognition.service';

describe('formatVietnamesePlate', () => {
  it('formats new Vietnamese car plates with five trailing digits', () => {
    expect(formatVietnamesePlate('59a12345')).toBe('59A-12345');
    expect(formatVietnamesePlate('51LD12345')).toBe('51LD-12345');
  });

  it('formats old Vietnamese car plates with four trailing digits', () => {
    expect(formatVietnamesePlate('29a1234')).toBe('29A-1234');
  });

  it('formats Vietnamese motorbike plates with letter-digit series and dotted tail', () => {
    expect(formatVietnamesePlate('59-X1 234.56')).toBe('59X1-234.56');
    expect(formatVietnamesePlate('90-B2 452.30')).toBe('90B2-452.30');
  });

  it('returns cleaned uppercase text when the plate does not match a supported format', () => {
    expect(formatVietnamesePlate('QD-123-AB')).toBe('QD123AB');
    expect(formatVietnamesePlate('')).toBe('');
  });
});
