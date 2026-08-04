import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  ValidateIf,
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

  // Required if loginMode === 'MANUAL'
  @ValidateIf((o: CreateCompanyDto) => o.loginMode === 'MANUAL')
  @IsString()
  @IsNotEmpty()
  ckey?: string;

  @ValidateIf((o: CreateCompanyDto) => o.loginMode === 'MANUAL')
  @IsString()
  @IsNotEmpty()
  cvalue?: string;
}
