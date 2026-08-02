import { Test, TestingModule } from '@nestjs/testing';
import { VehicleRegistrationsService } from './vehicle-registrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

describe('VehicleRegistrationsService', () => {
  let service: VehicleRegistrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleRegistrationsService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: { findFirst: jest.fn(), create: jest.fn() },
            vehicleRegistrationRequest: { findFirst: jest.fn(), create: jest.fn() },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notifyUser: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock-value') },
        },
      ],
    }).compile();

    service = module.get<VehicleRegistrationsService>(VehicleRegistrationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
