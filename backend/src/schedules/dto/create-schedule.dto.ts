import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class CreateScheduleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsIn(['once', 'daily', 'weekly', 'monthly', 'quarterly'])
  repeatMode: string;

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

  @IsString()
  @IsIn(['BUY', 'SELL', 'BOTH'])
  invoiceType: string;

  @IsOptional()
  @IsString()
  @IsIn(['SKIP', 'OVERWRITE', 'NEW_VERSION'])
  overwriteMode?: string;
}
