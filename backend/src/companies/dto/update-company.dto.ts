import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lookupPassword?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AUTO', 'MANUAL'])
  loginMode?: string;
}
