import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from './common.dto';

export class PeopleQueryDto {
    @IsOptional()
    @Trim()
    @IsString()
    @MaxLength(100)
    search?: string;
}
