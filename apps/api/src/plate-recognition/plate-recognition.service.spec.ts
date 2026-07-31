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

  it('normalizes motorbike OCR results with an extra province digit', () => {
    expect(formatVietnamesePlate('999E122268')).toBe('99E1-222.68');
  });

  it('returns cleaned uppercase text when the plate does not match a supported format', () => {
    expect(formatVietnamesePlate('QD-123-AB')).toBe('QD123AB');
    expect(formatVietnamesePlate('')).toBe('');
  });
});

describe('PlateScanResult canonical/display fields', () => {
  const service = new (require('./plate-recognition.service').PlateRecognitionService)({
    get: () => 'token',
  } as any);

  it('recognize() returns canonicalPlate and displayPlate alongside existing fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          processing_time: 100,
          results: [
            {
              plate: '30a12345',
              score: 0.99,
              dscore: 0.9,
              region: { code: 'vn' },
              vehicle: { type: 'Sedan' },
              box: { xmin: 0, ymin: 0, xmax: 100, ymax: 50 },
              candidates: [{ plate: '30a12345', score: 0.99 }],
            },
          ],
        }),
    } as any);

    const result = await service.recognize(Buffer.from('x'), 'image/jpeg');
    expect(result.plate).toBe('30A-12345'); // legacy format unchanged
    expect(result.rawPlate).toBe('30a12345');
    expect(result.canonicalPlate).toBe('30A12345');
    expect(result.displayPlate).toBe('30A-123.45');
    expect(result.vehicleType).toBe('Sedan');
    (global.fetch as any).mockRestore();
  });

  it('recognize() returns null canonical/display when nothing detected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ processing_time: 0, results: [] }),
    } as any);

    const result = await service.recognize(Buffer.from('x'), 'image/jpeg');
    expect(result.plate).toBeNull();
    expect(result.canonicalPlate).toBeNull();
    expect(result.displayPlate).toBeNull();
    (global.fetch as any).mockRestore();
  });
});
