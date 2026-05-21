import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): Promise<{ status: string; timestamp: string; database: string }> {
    return this.appService.getHealth();
  }
}
