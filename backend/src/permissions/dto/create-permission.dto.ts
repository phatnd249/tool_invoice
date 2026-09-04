import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z]+:[a-z]+$/, {
    message: 'Tên quyền phải theo định dạng "resource:action" (ví dụ: user:read)',
  })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  group!: string;
}
