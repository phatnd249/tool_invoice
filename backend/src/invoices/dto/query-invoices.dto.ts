import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryInvoicesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['BUY', 'SELL'])
  type?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'invoiceNumber',
    'invoiceDate',
    'templateSymbol',
    'invoiceSymbol',
    'sellerName',
    'sellerTaxCode',
    'buyerName',
    'buyerTaxCode',
    'totalBeforeTax',
    'taxAmount',
    'totalAmount',
    'createdAt',
  ])
  sortBy?: string = 'invoiceDate';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string = 'desc';
}
