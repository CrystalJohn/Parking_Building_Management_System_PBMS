import { Test, TestingModule } from '@nestjs/testing';
import { VehicleRegistrationsController } from './vehicle-registrations.controller';

describe('VehicleRegistrationsController', () => {
  let controller: VehicleRegistrationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehicleRegistrationsController],
    }).compile();

    controller = module.get<VehicleRegistrationsController>(VehicleRegistrationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
