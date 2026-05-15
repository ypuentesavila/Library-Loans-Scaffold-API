import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateReservationDto, @Req() req: { user: { id: string } }) {
    return this.reservationsService.create(dto, req.user.id);
  }

  @Get()
  findAll(@Req() req: { user: { id: string; role: string } }) {
    return this.reservationsService.findAll(req.user.id, req.user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string; role: string } },
  ) {
    return this.reservationsService.cancel(id, req.user.id, req.user.role);
  }
}
