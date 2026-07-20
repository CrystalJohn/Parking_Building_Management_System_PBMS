import { Test, TestingModule } from '@nestjs/testing';
import { VehicleRegistrationsService } from './vehicle-registrations.service';

describe('VehicleRegistrationsService', () => {
  let service: VehicleRegistrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VehicleRegistrationsService],
    }).compile();

    service = module.get<VehicleRegistrationsService>(VehicleRegistrationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
