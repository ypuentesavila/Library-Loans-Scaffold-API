import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ description: 'UUID of the borrowing user' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'UUID of the item to borrow' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '2026-06-15T00:00:00.000Z' })
  @IsDateString()
  dueAt: string;
}
