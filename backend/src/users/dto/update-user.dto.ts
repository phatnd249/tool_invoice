import { IsEmail, IsIn, IsOptional, IsString, IsArray } from 'class-validator';
import { IsCuid } from '../../common/decorators/is-cuid.decorator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'BANNED';

  @IsOptional()
  @IsArray()
  @IsCuid({ each: true })
  roleIds?: string[];
}
