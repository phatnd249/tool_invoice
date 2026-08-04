import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['bug', 'feature', 'improvement', 'other'])
  category: string;
}
