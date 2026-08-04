import { IsArray, IsOptional, IsString } from 'class-validator';
import { IsCuid } from '../../common/decorators/is-cuid.decorator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsCuid({ each: true })
  permissionIds?: string[];
}
