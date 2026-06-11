import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';import { VehicleIdentificationService } from './vehicle-identification.service';
import { ManualPlateIdentifier } from './strategies/manual-plate.identifier';
import { ReservationQrIdentifier } from './strategies/reservation-qr.identifier';
import { SessionQrIdentifier } from './strategies/session-qr.identifier';
import { ManualSessionCodeIdentifier } from './strategies/manual-session-code.identifier';

// ─── Unit tests for individual strategies ────────────────────────────────────

describe('ManualPlateIdentifier', () => {
  let identifier: ManualPlateIdentifier;

  beforeEach(() => {
    identifier = new ManualPlateIdentifier();
  });

  it('returns MANUAL_PLATE result for plain plate input', async () => {
    const result = await identifier.identify({ licensePlate: '59a-12345' });
    expect(result).not.toBeNull();
    expect(result!.source).toBe('MANUAL_PLATE');
    expect(result!.licensePlate).toBe('59A-12345');
  });

  it('normalizes plate to uppercase', async () => {
    const result = await identifier.identify({ licensePlate: '29b1-00001' });
    expect(result!.licensePlate).toBe('29B1-00001');
  });

  it('returns OCR source when isOcr = true', async () => {
    const result = await identifier.identify({ licensePlate: '59A-12345', isOcr: true, confidence: 0.98 });
    expect(result!.source).toBe('OCR');
    expect(result!.confidence).toBe(0.98);
  });

  it('returns null for empty plate', async () => {
    const result = await identifier.identify({ licensePlate: '  ' });
    expect(result).toBeNull();
  });
});

describe('ReservationQrIdentifier', () => {
  let identifier: ReservationQrIdentifier;
  let prisma: { reservation: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { reservation: { findUnique: jest.fn() } };
    identifier = new ReservationQrIdentifier(prisma as any);
  });

  it('returns RESERVATION_QR result for an active reservation', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-uuid',
      status: 'active',
    });

    const result = await identifier.identify({ reservationId: 'res-uuid' });
    expect(result).not.toBeNull();
    expect(result!.source).toBe('RESERVATION_QR');
    expect(result!.reservationId).toBe('res-uuid');
  });

  it('returns null when reservation does not exist', async () => {
    prisma.reservation.findUnique.mockResolvedValue(null);

    const result = await identifier.identify({ reservationId: 'nonexistent' });
    expect(result).toBeNull();
  });

  it('returns null when reservation is expired', async () => {
    prisma.reservation.findUnique.mockResolvedValue({ id: 'res-uuid', status: 'expired' });

    const result = await identifier.identify({ reservationId: 'res-uuid' });
    expect(result).toBeNull();
  });

  it('returns null for empty reservationId', async () => {
    const result = await identifier.identify({ reservationId: '' });
    expect(result).toBeNull();
    expect(prisma.reservation.findUnique).not.toHaveBeenCalled();
  });
});

describe('SessionQrIdentifier', () => {
  let identifier: SessionQrIdentifier;
  let prisma: { parkingSession: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { parkingSession: { findUnique: jest.fn() } };
    identifier = new SessionQrIdentifier(prisma as any);
  });

  it('returns SESSION_QR result for an active session', async () => {
    prisma.parkingSession.findUnique.mockResolvedValue({
      id: 'session-uuid',
      status: 'active',
      licensePlate: '59A-12345',
    });

    const result = await identifier.identify({ sessionId: 'session-uuid' });
    expect(result!.source).toBe('SESSION_QR');
    expect(result!.sessionId).toBe('session-uuid');
    expect(result!.licensePlate).toBe('59A-12345');
  });

  it('returns null when session is completed', async () => {
    prisma.parkingSession.findUnique.mockResolvedValue({ id: 'session-uuid', status: 'completed' });

    const result = await identifier.identify({ sessionId: 'session-uuid' });
    expect(result).toBeNull();
  });

  it('returns null when session not found', async () => {
    prisma.parkingSession.findUnique.mockResolvedValue(null);

    const result = await identifier.identify({ sessionId: 'nonexistent' });
    expect(result).toBeNull();
  });

  it('returns null for empty sessionId', async () => {
    const result = await identifier.identify({ sessionId: '   ' });
    expect(result).toBeNull();
    expect(prisma.parkingSession.findUnique).not.toHaveBeenCalled();
  });
});

describe('ManualSessionCodeIdentifier', () => {
  let identifier: ManualSessionCodeIdentifier;

  beforeEach(() => {
    identifier = new ManualSessionCodeIdentifier();
  });

  it('returns MANUAL_SESSION_CODE result', async () => {
    const result = await identifier.identify({ sessionId: 'session-uuid' });
    expect(result!.source).toBe('MANUAL_SESSION_CODE');
    expect(result!.sessionId).toBe('session-uuid');
  });

  it('returns null for empty input', async () => {
    const result = await identifier.identify({ sessionId: '' });
    expect(result).toBeNull();
  });
});

// ─── VehicleIdentificationService orchestration tests ────────────────────────

describe('VehicleIdentificationService — identifyForCheckIn()', () => {
  let service: VehicleIdentificationService;
  let manualPlate: { identify: jest.Mock };
  let reservationQr: { identify: jest.Mock };
  let sessionQr: { identify: jest.Mock };
  let manualSessionCode: { identify: jest.Mock };

  const mockManualPlateResult = { source: 'MANUAL_PLATE', licensePlate: '59A-12345' };
  const mockOcrResult = { source: 'OCR', licensePlate: '59A-12345', confidence: 0.97 };
  const mockReservationResult = { source: 'RESERVATION_QR', reservationId: 'res-uuid' };

  beforeEach(async () => {
    manualPlate = { identify: jest.fn() };
    reservationQr = { identify: jest.fn() };
    sessionQr = { identify: jest.fn() };
    manualSessionCode = { identify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleIdentificationService,
        { provide: ManualPlateIdentifier, useValue: manualPlate },
        { provide: ReservationQrIdentifier, useValue: reservationQr },
        { provide: SessionQrIdentifier, useValue: sessionQr },
        { provide: ManualSessionCodeIdentifier, useValue: manualSessionCode },
      ],
    }).compile();

    service = module.get(VehicleIdentificationService);
  });

  it('uses RESERVATION_QR strategy when reservationId is provided', async () => {
    reservationQr.identify.mockResolvedValue(mockReservationResult);

    const result = await service.identifyForCheckIn({
      reservationId: 'res-uuid',
      licensePlate: '59A-12345',
    });

    expect(result.source).toBe('RESERVATION_QR');
    expect(result.reservationId).toBe('res-uuid');
    expect(manualPlate.identify).not.toHaveBeenCalled();
  });

  it('carries through licensePlate when both reservationId and plate are provided', async () => {
    reservationQr.identify.mockResolvedValue({ ...mockReservationResult });

    const result = await service.identifyForCheckIn({
      reservationId: 'res-uuid',
      licensePlate: '59a-12345',
    });

    expect(result.licensePlate).toBe('59A-12345');
  });

  it('falls back to MANUAL_PLATE when reservationId returns null', async () => {
    reservationQr.identify.mockResolvedValue(null);
    manualPlate.identify.mockResolvedValue(mockManualPlateResult);

    const result = await service.identifyForCheckIn({
      reservationId: 'expired-res',
      licensePlate: '59A-12345',
    });

    expect(result.source).toBe('MANUAL_PLATE');
    expect(manualPlate.identify).toHaveBeenCalled();
  });

  it('uses OCR strategy when licensePlate + confidence are provided', async () => {
    manualPlate.identify.mockResolvedValue(mockOcrResult);

    const result = await service.identifyForCheckIn({
      licensePlate: '59A-12345',
      identificationConfidence: 0.97,
    });

    expect(manualPlate.identify).toHaveBeenCalledWith(
      expect.objectContaining({ isOcr: true, confidence: 0.97 }),
    );
    expect(result.source).toBe('OCR');
  });

  it('uses MANUAL_PLATE strategy for plain plate without confidence', async () => {
    manualPlate.identify.mockResolvedValue(mockManualPlateResult);

    const result = await service.identifyForCheckIn({ licensePlate: '59A-12345' });

    expect(manualPlate.identify).toHaveBeenCalledWith(
      expect.objectContaining({ isOcr: false }),
    );
    expect(result.source).toBe('MANUAL_PLATE');
  });

  it('throws BadRequestException when no usable input is provided', async () => {
    await expect(service.identifyForCheckIn({})).rejects.toThrow(BadRequestException);
  });
});

describe('VehicleIdentificationService — identifyForCheckout()', () => {
  let service: VehicleIdentificationService;
  let manualPlate: { identify: jest.Mock };
  let reservationQr: { identify: jest.Mock };
  let sessionQr: { identify: jest.Mock };
  let manualSessionCode: { identify: jest.Mock };

  beforeEach(async () => {
    manualPlate = { identify: jest.fn() };
    reservationQr = { identify: jest.fn() };
    sessionQr = { identify: jest.fn() };
    manualSessionCode = { identify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleIdentificationService,
        { provide: ManualPlateIdentifier, useValue: manualPlate },
        { provide: ReservationQrIdentifier, useValue: reservationQr },
        { provide: SessionQrIdentifier, useValue: sessionQr },
        { provide: ManualSessionCodeIdentifier, useValue: manualSessionCode },
      ],
    }).compile();

    service = module.get(VehicleIdentificationService);
  });

  it('uses SESSION_QR strategy when sessionId is provided', async () => {
    sessionQr.identify.mockResolvedValue({
      source: 'SESSION_QR',
      sessionId: 'session-uuid',
      licensePlate: '59A-12345',
    });

    const result = await service.identifyForCheckout({ sessionId: 'session-uuid' });

    expect(result.source).toBe('SESSION_QR');
    expect(result.sessionId).toBe('session-uuid');
    expect(manualPlate.identify).not.toHaveBeenCalled();
  });

  it('falls back to LICENSE_PLATE when sessionQr returns null', async () => {
    sessionQr.identify.mockResolvedValue(null);
    manualPlate.identify.mockResolvedValue({
      source: 'MANUAL_PLATE',
      licensePlate: '59A-12345',
    });

    const result = await service.identifyForCheckout({
      sessionId: 'not-found-session',
      licensePlate: '59A-12345',
    });

    expect(result.source).toBe('MANUAL_PLATE');
    expect(result.licensePlate).toBe('59A-12345');
  });

  it('uses LICENSE_PLATE when only licensePlate is provided', async () => {
    manualPlate.identify.mockResolvedValue({
      source: 'MANUAL_PLATE',
      licensePlate: '59A-12345',
    });

    const result = await service.identifyForCheckout({ licensePlate: '59A-12345' });

    expect(result.source).toBe('MANUAL_PLATE');
    expect(manualPlate.identify).toHaveBeenCalled();
  });

  it('throws BadRequestException when no usable input is provided', async () => {
    await expect(service.identifyForCheckout({})).rejects.toThrow(BadRequestException);
  });
});
