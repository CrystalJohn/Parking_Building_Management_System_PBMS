import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CreateGateDto, UpdateGateDto } from './dto';
import { GatesService } from './gates.service';

@Controller('gates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GatesController {
  constructor(private readonly gatesService: GatesService) {}

  @Get()
  @Roles(Role.manager, Role.admin)
  listGates() {
    return this.gatesService.listGates();
  }

  @Get(':id')
  @Roles(Role.manager, Role.admin)
  getGate(@Param('id', ParseUUIDPipe) id: string) {
    return this.gatesService.getGate(id);
  }

  @Post()
  @Roles(Role.manager, Role.admin)
  create(@Body() dto: CreateGateDto) {
    return this.gatesService.createGate(dto);
  }

  @Patch(':id')
  @Roles(Role.manager, Role.admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGateDto) {
    return this.gatesService.updateGate(id, dto);
  }

  @Delete(':id')
  @Roles(Role.manager, Role.admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.gatesService.deleteGate(id);
  }
}
