import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['once', 'daily', 'weekly', 'monthly', 'quarterly'])
  repeatMode?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  dateRangeDays?: number;

  @IsOptional()
  @IsString()
  @IsIn(['BUY', 'SELL', 'BOTH'])
  invoiceType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SKIP', 'OVERWRITE', 'NEW_VERSION'])
  overwriteMode?: string;
}
