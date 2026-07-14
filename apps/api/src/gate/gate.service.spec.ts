import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionStatus } from '@prisma/client';
import { OcrService } from '../ocr';
import { SessionsService } from '../sessions/sessions.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { GateService } from './gate.service';

describe('GateService', () => {
  let service: GateService;
  let ocrService: { recognize: jest.Mock; linkEvidenceToCheckout: jest.Mock };
  let sessionsService: { lookupOpenForGateByPlate: jest.Mock };
  let vehiclesService: { lookupPlate: jest.Mock };

  beforeEach(async () => {
    ocrService = { recognize: jest.fn(), linkEvidenceToCheckout: jest.fn() };
    sessionsService = { lookupOpenForGateByPlate: jest.fn() };
    vehiclesService = { lookupPlate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        { provide: OcrService, useValue: ocrService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: VehiclesService, useValue: vehiclesService },
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
  });

  it('routes manual resolve to PAYMENT_REQUIRED without calling OCR again', async () => {
    sessionsService.lookupOpenForGateByPlate.mockResolvedValue({
      session: {
        id: 'session-1',
        status: SessionStatus.active,
      },
    });

    const result = await service.resolvePlate({ plate: ' 59A-12345 ', ocrEvidenceId: 'ocr-1' });

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

    await expect(service.resolvePlate({ plate: '59A12345' })).resolves.toMatchObject({
      mode: 'CHECK_OUT',
      subMode: 'PAYMENT_PENDING',
    });
    await expect(service.resolvePlate({ plate: '59A12345' })).resolves.toMatchObject({
      mode: 'CHECK_OUT',
      subMode: 'READY_TO_EXIT',
    });
  });

  it('rejects empty manual plate input', async () => {
    await expect(service.resolvePlate({ plate: '   ' })).rejects.toThrow(BadRequestException);
  });
});
