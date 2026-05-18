import { IsArray, IsString, IsIn } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class ChatRequestDto {
  @IsArray()
  messages!: ChatMessageDto[];
}
