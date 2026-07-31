import { IsString, IsNotEmpty } from 'class-validator';

export class ManualLoginDto {
  @IsString()
  @IsNotEmpty()
  ckey: string;

  @IsString()
  @IsNotEmpty()
  cvalue: string;
}
