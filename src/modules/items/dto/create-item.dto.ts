import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ItemType } from '../entities/item.entity';

export class CreateItemDto {
  @ApiProperty({ example: 'BK-0042', maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'El Quijote', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: ItemType })
  @IsEnum(ItemType)
  type: ItemType;
}
