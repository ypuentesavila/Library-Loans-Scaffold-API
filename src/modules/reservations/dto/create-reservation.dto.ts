import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ description: 'Item to reserve (must be currently on active/overdue loan)' })
  @IsUUID()
  itemId: string;
}
