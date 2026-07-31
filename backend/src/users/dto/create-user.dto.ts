import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { IsCuid } from '../../common/decorators/is-cuid.decorator';

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsCuid({ each: true })
  roleIds!: string[];
}
