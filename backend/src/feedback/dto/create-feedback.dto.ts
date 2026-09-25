import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @IsIn(['bug', 'feature', 'improvement', 'other'])
  category: string;
}
