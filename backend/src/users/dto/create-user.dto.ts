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
    message: 'Mật khẩu phải chứa ít nhất một chữ cái và một chữ số',
  })
  password!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsCuid({ each: true })
  roleIds!: string[];
}
