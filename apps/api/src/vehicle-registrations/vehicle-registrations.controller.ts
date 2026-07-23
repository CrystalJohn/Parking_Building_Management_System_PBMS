import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { VehicleRegistrationsService } from './vehicle-registrations.service';
import { CreateVehicleRegistrationDto, ReviewVehicleRegistrationDto } from './dto';

// Evidence photos are small JPEG/PNG frames; cap to avoid abuse.
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller('vehicle-registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleRegistrationsController {
  constructor(private readonly vehicleRegistrationsService: VehicleRegistrationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.driver)
  @UseInterceptors(
    FileInterceptor('evidence', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  createRequest(
    @CurrentUser('id') driverId: string,
    @Body() dto: CreateVehicleRegistrationDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Vui lòng tải lên ảnh bằng chứng (Cà vẹt xe)');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('File tải lên phải là hình ảnh');
    }
    return this.vehicleRegistrationsService.createRequest(driverId, dto, file);
  }

  @Get('my')
  @Roles(Role.driver)
  findMyRequests(@CurrentUser('id') driverId: string) {
    return this.vehicleRegistrationsService.findMyRequests(driverId);
  }

  @Get('pending')
  @Roles(Role.manager, Role.admin)
  findPendingRequests() {
    return this.vehicleRegistrationsService.findPendingRequests();
  }

  @Get('history')
  @Roles(Role.manager, Role.admin)
  findHistoricalRequests() {
    return this.vehicleRegistrationsService.findHistoricalRequests();
  }

  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.manager, Role.admin)
  reviewRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') managerId: string,
    @Body() dto: ReviewVehicleRegistrationDto,
  ) {
    return this.vehicleRegistrationsService.reviewRequest(id, dto, managerId);
  }
}
