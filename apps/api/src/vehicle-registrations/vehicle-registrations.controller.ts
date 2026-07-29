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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { VehicleRegistrationsService } from './vehicle-registrations.service';
import { CreateVehicleRegistrationDto, ReviewVehicleRegistrationDto } from './dto';

// Evidence photos are small JPEG/PNG frames; cap to avoid abuse.
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB per file

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
    FileFieldsInterceptor([
      { name: 'evidenceCaVant', maxCount: 1 },
      { name: 'evidenceOverall', maxCount: 1 },
      { name: 'evidencePlate', maxCount: 1 },
    ], {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  createRequest(
    @CurrentUser('id') driverId: string,
    @Body() dto: CreateVehicleRegistrationDto,
    @UploadedFiles()
    files: {
      evidenceCaVant?: UploadedImage[];
      evidenceOverall?: UploadedImage[];
      evidencePlate?: UploadedImage[];
    },
  ) {
    const caVant = files?.evidenceCaVant?.[0]
    const overall = files?.evidenceOverall?.[0]
    const plate = files?.evidencePlate?.[0]

    if (!caVant || !caVant.buffer?.length) {
      throw new BadRequestException('Vui lòng tải lên ảnh Cà vẹt xe');
    }
    if (!overall || !overall.buffer?.length) {
      throw new BadRequestException('Vui lòng tải lên ảnh tổng thể xe');
    }
    if (!plate || !plate.buffer?.length) {
      throw new BadRequestException('Vui lòng tải lên ảnh cận cảnh biển số');
    }
    for (const f of [caVant, overall, plate]) {
      if (!f.mimetype?.startsWith('image/')) {
        throw new BadRequestException('File tải lên phải là hình ảnh');
      }
    }
    return this.vehicleRegistrationsService.createRequest(driverId, dto, caVant, overall, plate);
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
