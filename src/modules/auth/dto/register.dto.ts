import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@library.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'securepass123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
