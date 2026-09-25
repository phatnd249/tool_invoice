import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
} from 'class-validator';

export class CreateCompanyDto {
  /**
   * Mã số thuế Việt Nam: 10 chữ số, 13 chữ số (chi nhánh/mã cấp huyện),
   * hoặc định dạng 10-xx cho phòng thuế quản lý (một số doanh nghiệp cũ).
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}(-\d{2})?$|^\d{13}$/, {
    message: 'Mã số thuế không hợp lệ (định dạng: 10 hoặc 13 chữ số)',
  })
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
