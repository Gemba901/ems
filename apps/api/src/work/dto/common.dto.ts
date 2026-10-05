import { ValidationPipe } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { buildMessage, IsInt, IsOptional, Max, Min, ValidateBy, ValidationOptions } from 'class-validator';
import { isDateOnly } from '../work-date';

// The global pipe strips unknown fields but does not transform, so query strings
// stay strings and @Type/@Transform never run. Work controllers use this instead.
export const workValidationPipe = new ValidationPipe({ whitelist: true, transform: true });

// Trims strings so whitespace-only input fails @Length/@IsNotEmpty with a 400
// instead of reaching the DB CHECK constraints.
export function Trim(): PropertyDecorator {
    return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

// A real calendar date in YYYY-MM-DD form.
export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
    return ValidateBy(
        {
            name: 'isDateOnly',
            validator: {
                validate: (value) => isDateOnly(value),
                defaultMessage: buildMessage((prefix) => `${prefix}$property must be a date in YYYY-MM-DD format`, options),
            },
        },
        options,
    );
}

export class PageQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize: number = 50;
}

export function pageArgs(query: PageQueryDto): { skip: number; take: number } {
    return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export type Page<T> = {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
};
