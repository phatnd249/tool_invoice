import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryCompaniesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AUTO', 'MANUAL'])
  loginMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['name', 'taxCode', 'createdAt', 'updatedAt', 'downloadCount'])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string = 'desc';
}
