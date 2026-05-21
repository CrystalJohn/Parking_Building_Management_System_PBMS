import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status ok', async () => {
      const result = await appController.getHealth();
      expect(result.status).toBe('ok');
    });

    it('should return a timestamp', async () => {
      const result = await appController.getHealth();
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      // Should be a valid ISO date string
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
