import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { FilterLoanDto } from './dto/filter-loan.dto';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLoanDto) {
    return this.loansService.createLoan(dto);
  }

  @Get()
  findAll(@Query() filter: FilterLoanDto) {
    return this.loansService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id/return')
  returnLoan(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.returnLoan(id);
  }

  @Patch(':id/mark-lost')
  markLost(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.markLost(id);
  }
}
