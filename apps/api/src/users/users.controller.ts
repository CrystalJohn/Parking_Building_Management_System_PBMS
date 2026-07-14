import {
  BadRequestException,
  Query,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/decorators';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/lookup-by-phone — find user by phone (admin & manager only)
   */
  @Get('lookup-by-phone')
  @Roles(Role.admin, Role.manager)
  lookupByPhone(@Query('phone') phone: string) {
    if (!phone) {
      throw new BadRequestException('Phone query parameter is required');
    }
    return this.usersService.findOneByPhone(phone);
  }

  /**
   * GET /users — list all users (admin only)
   * Req 12.1
   */
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * POST /users — create a new user account (admin only)
   * Req 12.2
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /**
   * PATCH /users/:id — update user fields (admin only)
   * Req 12.2
   */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.update(id, dto, actorId);
  }

  /**
   * DELETE /users/:id — soft-deactivate user (admin only)
   * Sets is_active = false; JwtStrategy revokes sessions on next request.
   * Req 12.4
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.deactivate(id, actorId);
  }
}
