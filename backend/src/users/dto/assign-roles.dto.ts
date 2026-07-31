import { IsArray, ArrayNotEmpty } from 'class-validator';
import { IsCuid } from '../../common/decorators/is-cuid.decorator';

export class AssignRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsCuid({ each: true })
  roleIds!: string[];
}
