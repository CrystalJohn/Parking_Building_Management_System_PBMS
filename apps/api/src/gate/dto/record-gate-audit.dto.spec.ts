import 'reflect-metadata';
import { validate } from 'class-validator';
import { RecordGateAuditDto } from './record-gate-audit.dto';

describe('RecordGateAuditDto', () => {
  const validPayload = {
    canonicalPlate: '43A27208',
    vehicleStatus: 'ACTIVE_SESSION',
    recommendedAction: 'CHECKOUT',
    actualAction: 'CHECKIN',
  };

  it('accepts a valid payload with all optional fields', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, {
      ...validPayload,
      reason: 'Vehicle actually checked in',
      sessionId: '11111111-1111-4111-8111-111111111111',
      reservationId: '22222222-2222-4222-8222-222222222222',
    });

    const errors = await validate(dto);

    expect(errors).toEqual([]);
  });

  it('accepts a payload without the optional fields', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, validPayload);

    const errors = await validate(dto);

    expect(errors).toEqual([]);
  });

  it('rejects an invalid vehicleStatus', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, { ...validPayload, vehicleStatus: 'EXPIRED_SESSION' });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'vehicleStatus' })]);
  });

  it('rejects an invalid recommendedAction', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, { ...validPayload, recommendedAction: 'REFUND' });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'recommendedAction' })]);
  });

  it('rejects an invalid actualAction', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, { ...validPayload, actualAction: 'OVERRIDE' });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'actualAction' })]);
  });

  it('rejects a malformed canonicalPlate', async () => {
    const dto = new RecordGateAuditDto();
    Object.assign(dto, { ...validPayload, canonicalPlate: 'ABC-123' });

    const errors = await validate(dto);

    expect(errors).toEqual([expect.objectContaining({ property: 'canonicalPlate' })]);
  });
});
