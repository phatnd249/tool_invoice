import { IsString, IsNotEmpty, IsOptional, IsIn, IsDateString } from 'class-validator';

export class DownloadInvoicesDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @IsIn(['BUY', 'SELL', 'BOTH'])
  invoiceType?: string = 'BOTH';
}
