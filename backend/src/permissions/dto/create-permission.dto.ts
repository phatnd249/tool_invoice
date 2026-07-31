import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z]+:[a-z]+$/, {
    message: 'Permission name must follow the format "resource:action" (e.g., user:read)',
  })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  group!: string;
}
