import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { OperationIssueStatus, Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CreateOperationIssueDto } from './dto/create-operation-issue.dto';
import { UpdateOperationIssueDto } from './dto/update-operation-issue.dto';
import { OperationIssuesService } from './operation-issues.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationIssuesController {
  constructor(private readonly issuesService: OperationIssuesService) {}

  @Post('operation-issues')
  @Roles(Role.staff)
  createIssue(
    @Body() dto: CreateOperationIssueDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.issuesService.create(dto, staffId);
  }

  @Get('manager/operation-issues')
  @Roles(Role.manager, Role.admin)
  listIssues(@Query('status') status?: OperationIssueStatus) {
    return this.issuesService.findMany(status);
  }

  @Get('manager/operation-issues/summary')
  @Roles(Role.manager, Role.admin)
  getSummary() {
    return this.issuesService.getSummary();
  }

  @Patch('manager/operation-issues/:id')
  @Roles(Role.manager, Role.admin)
  updateIssue(
    @Param('id') id: string,
    @Body() dto: UpdateOperationIssueDto,
    @CurrentUser('id') managerId: string,
  ) {
    return this.issuesService.update(id, dto, managerId);
  }

  @Get('manager/operation-issues/events')
  @Roles(Role.manager, Role.admin)
  streamIssues(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const cleanup = this.issuesService.addStreamClient(res);
    res.on('close', cleanup);
  }
}
