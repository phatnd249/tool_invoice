import { IsIn, IsOptional, IsString } from 'class-validator';
import { IsCuid } from '../../common/decorators/is-cuid.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryUsersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'BANNED';

  @IsOptional()
  @IsCuid()
  roleId?: string;

  @IsOptional()
  @IsIn(['createdAt', 'fullName'])
  sortBy?: 'createdAt' | 'fullName';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
