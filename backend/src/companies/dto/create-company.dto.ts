import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  taxCode: string;

  @IsString()
  @IsNotEmpty()
  lookupPassword: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AUTO', 'MANUAL'])
  loginMode?: string = 'AUTO';
}