import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status ok', () => {
      const result = appController.getHealth();
      expect(result.status).toBe('ok');
    });

    it('should return a timestamp', () => {
      const result = appController.getHealth();
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      // Should be a valid ISO date string
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
