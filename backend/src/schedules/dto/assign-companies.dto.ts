import { IsArray, IsString } from 'class-validator';

export class AssignCompaniesDto {
  @IsArray()
  @IsString({ each: true })
  companyIds: string[];
}
