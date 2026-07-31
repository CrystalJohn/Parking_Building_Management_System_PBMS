import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionStatus } from '@prisma/client';
import { OcrService } from '../ocr';
import { SessionsService } from '../sessions/sessions.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { GateService } from './gate.service';

describe('GateService', () => {
  let service: GateService;
  let ocrService: { recognize: jest.Mock; linkEvidenceToCheckout: jest.Mock };
  let sessionsService: { lookupOpenForGateByPlate: jest.Mock };
  let vehiclesService: { lookupPlate: jest.Mock };
  let gateLanesService: { requireActiveLane: jest.Mock; assertVehicleType: jest.Mock };
  let reservationsService: { findActiveByCanonicalPlate: jest.Mock };
  let prismaService: { ocrEvidence: { findUnique: jest.Mock } };

  beforeEach(async () => {
    ocrService = { recognize: jest.fn(), linkEvidenceToCheckout: jest.fn() };
    sessionsService = { lookupOpenForGateByPlate: jest.fn() };
    vehiclesService = { lookupPlate: jest.fn() };
    gateLanesService = {
      requireActiveLane: jest.fn().mockResolvedValue({ gateLane: { id: 'lane-1', code: 'L1', name: 'Lane 1', vehicleType: 'car' } }),
      assertVehicleType: jest.fn(),
    };
    reservationsService = { findActiveByCanonicalPlate: jest.fn() };
    prismaService = { ocrEvidence: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        { provide: OcrService, useValue: ocrService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: GateLanesService, useValue: gateLanesService },
        { provide: ReservationsService, useValue: reservationsService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<GateService>(GateService);
  });

  it('returns NEEDS_MANUAL_PLATE when OCR cannot detect a plate', async () => {
    ocrService.recognize.mockResolvedValue({
      ocrEvidenceId: 'ocr-1',
      detectedPlate: null,
      confidence: null,
      error: 'No plate detected',
    });

    const result = await service.scanPlate({} as any, {}, 'staff-1');

    expect(result).toEqual({
      mode: 'NEEDS_MANUAL_PLATE',
      source: 'OCR',
      ocrEvidenceId: 'ocr-1',
      error: 'No plate detected',
    });
    expect(sessionsService.lookupOpenForGateByPlate).not.toHaveBeenCalled();
    expect(vehiclesService.lookupPlate).not.toHaveBeenCalled();
  });

  it('routes OCR scan to CHECK_IN when the plate has no open session', async () => {
    ocrService.recognize.mockResolvedValue({
      ocrEvidenceId: 'ocr-1',
      detectedPlate: '59A-123.45',
      confidence: 0.97,
      error: null,
    });
    sessionsService.lookupOpenForGateByPlate.mockResolvedValue(null);
    vehiclesService.lookupPlate.mockResolvedValue({
      inputPlate: '59A12345',
      normalizedPlate: '59A12345',
      matched: false,
      mode: 'WALK_IN',
    });

    const result = await service.scanPlate({} as any, {}, 'staff-1');

    expect(sessionsService.lookupOpenForGateByPlate).toHaveBeenCalledWith('59A12345');
    expect(vehiclesService.lookupPlate).toHaveBeenCalledWith('59A12345');
    expect(result).toMatchObject({
      mode: 'CHECK_IN',
      source: 'OCR',
      plateConfirmed: '59A12345',
      plateOcr: '59A-123.45',
      confidence: 0.97,
      ocrEvidenceId: 'ocr-1',
    });
    expect(result).toMatchObject({ plateDisplay: '59A-123.45' });
  });

  it('routes manual resolve to PAYMENT_REQUIRED without calling OCR again', async () => {
    sessionsService.lookupOpenForGateByPlate.mockResolvedValue({
      session: {
        id: 'session-1',
        status: SessionStatus.active,
      },
    });

    const result = await service.resolvePlate({ plate: ' 59A-12345 ', ocrEvidenceId: 'ocr-1' }, 'staff-1');

    expect(ocrService.recognize).not.toHaveBeenCalled();
    expect(sessionsService.lookupOpenForGateByPlate).toHaveBeenCalledWith('59A12345');
    expect(result).toMatchObject({
      mode: 'CHECK_OUT',
      source: 'MANUAL',
      plateConfirmed: '59A12345',
      ocrEvidenceId: 'ocr-1',
      subMode: 'PAYMENT_REQUIRED',
    });
  });

  it('maps checkout_pending and exit_authorized sessions to gate sub-modes', async () => {
    sessionsService.lookupOpenForGateByPlate.mockResolvedValueOnce({
      session: {
        id: 'session-2',
        status: SessionStatus.checkout_pending,
      },
    });
    sessionsService.lookupOpenForGateByPlate.mockResolvedValueOnce({
      session: {
        id: 'session-3',
        status: SessionStatus.exit_authorized,
      },
    });

    await expect(service.resolvePlate({ plate: '59A12345' }, 'staff-1')).resolves.toMatchObject({
      mode: 'CHECK_OUT',
      subMode: 'PAYMENT_PENDING',
    });
    await expect(service.resolvePlate({ plate: '59A12345' }, 'staff-1')).resolves.toMatchObject({
      mode: 'CHECK_OUT',
      subMode: 'READY_TO_EXIT',
    });
  });

  it('rejects empty manual plate input', async () => {
    await expect(service.resolvePlate({ plate: '   ' }, 'staff-1')).rejects.toThrow(BadRequestException);
  });

  describe('verifyPlate', () => {
    it('returns ACTIVE_SESSION/CHECKOUT with sessionId and subMode when an open session exists', async () => {
      sessionsService.lookupOpenForGateByPlate.mockResolvedValue({
        session: { id: 'session-1', status: SessionStatus.active },
      });

      const result = await service.verifyPlate({ canonicalPlate: '43A-272.08', staffId: 'staff-1' });

      expect(sessionsService.lookupOpenForGateByPlate).toHaveBeenCalledWith('43A27208');
      expect(reservationsService.findActiveByCanonicalPlate).not.toHaveBeenCalled();
      expect(result).toEqual({
        plate: '43A-272.08',
        canonicalPlate: '43A27208',
        vehicleStatus: 'ACTIVE_SESSION',
        recommendedAction: 'CHECKOUT',
        confidence: null,
        sessionId: 'session-1',
        subMode: 'PAYMENT_REQUIRED',
      });
    });

    it('maps every open-session status to its gate checkout sub-mode', async () => {
      sessionsService.lookupOpenForGateByPlate
        .mockResolvedValueOnce({ session: { id: 's1', status: SessionStatus.active } })
        .mockResolvedValueOnce({ session: { id: 's2', status: SessionStatus.checkout_pending } })
        .mockResolvedValueOnce({ session: { id: 's3', status: SessionStatus.exit_authorized } });

      await expect(service.verifyPlate({ canonicalPlate: '43A27208' })).resolves.toMatchObject({
        vehicleStatus: 'ACTIVE_SESSION',
        subMode: 'PAYMENT_REQUIRED',
      });
      await expect(service.verifyPlate({ canonicalPlate: '43A27208' })).resolves.toMatchObject({
        vehicleStatus: 'ACTIVE_SESSION',
        subMode: 'PAYMENT_PENDING',
      });
      await expect(service.verifyPlate({ canonicalPlate: '43A27208' })).resolves.toMatchObject({
        vehicleStatus: 'ACTIVE_SESSION',
        subMode: 'READY_TO_EXIT',
      });
    });

    it('returns ACTIVE_RESERVATION/CHECKIN with reservationId when no session but an active reservation exists', async () => {
      sessionsService.lookupOpenForGateByPlate.mockResolvedValue(null);
      reservationsService.findActiveByCanonicalPlate.mockResolvedValue({ id: 'res-1' });

      const result = await service.verifyPlate({ canonicalPlate: '43A27208', staffId: 'staff-1' });

      expect(sessionsService.lookupOpenForGateByPlate).toHaveBeenCalledWith('43A27208');
      expect(reservationsService.findActiveByCanonicalPlate).toHaveBeenCalledWith('43A27208');
      expect(result).toEqual({
        plate: '43A-272.08',
        canonicalPlate: '43A27208',
        vehicleStatus: 'ACTIVE_RESERVATION',
        recommendedAction: 'CHECKIN',
        confidence: null,
        reservationId: 'res-1',
      });
    });

    it('returns UNKNOWN/MANUAL_REVIEW when neither session nor reservation exists', async () => {
      sessionsService.lookupOpenForGateByPlate.mockResolvedValue(null);
      reservationsService.findActiveByCanonicalPlate.mockResolvedValue(null);

      const result = await service.verifyPlate({ canonicalPlate: '43A27208' });

      expect(result).toEqual({
        plate: '43A-272.08',
        canonicalPlate: '43A27208',
        vehicleStatus: 'UNKNOWN',
        recommendedAction: 'MANUAL_REVIEW',
        confidence: null,
      });
    });

    it('gives ACTIVE_SESSION priority over ACTIVE_RESERVATION when both exist', async () => {
      sessionsService.lookupOpenForGateByPlate.mockResolvedValue({
        session: { id: 'session-1', status: SessionStatus.active },
      });
      reservationsService.findActiveByCanonicalPlate.mockResolvedValue({ id: 'res-1' });

      const result = await service.verifyPlate({ canonicalPlate: '43A27208' });

      expect(result).toMatchObject({
        vehicleStatus: 'ACTIVE_SESSION',
        recommendedAction: 'CHECKOUT',
        sessionId: 'session-1',
      });
      expect(reservationsService.findActiveByCanonicalPlate).not.toHaveBeenCalled();
    });

    it('returns confidence null when no evidence id is provided', async () => {
      const result = await service.verifyPlate({ canonicalPlate: '43A27208' });

      expect(prismaService.ocrEvidence.findUnique).not.toHaveBeenCalled();
      expect(result).toMatchObject({ confidence: null });
    });

    it('loads confidence from the evidence row when ocrEvidenceId is provided', async () => {
      prismaService.ocrEvidence.findUnique.mockResolvedValue({ ocrConfidence: 0.98 });

      const result = await service.verifyPlate({ canonicalPlate: '43A27208', ocrEvidenceId: 'evidence-1' });

      expect(prismaService.ocrEvidence.findUnique).toHaveBeenCalledWith({
        where: { id: 'evidence-1' },
        select: { ocrConfidence: true },
      });
      expect(result).toMatchObject({ confidence: 0.98 });
    });

    it('does not throw when the evidence id is unknown; confidence stays null', async () => {
      prismaService.ocrEvidence.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyPlate({ canonicalPlate: '43A27208', ocrEvidenceId: 'missing-evidence' }),
      ).resolves.toMatchObject({ confidence: null });
    });
  });
});
