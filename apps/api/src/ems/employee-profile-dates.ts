import { BadRequestException } from '@nestjs/common';

// Optional means absent, not an invalid empty ISO date. Blank/null preserves the existing value.
export function optionalProfileDate(value: unknown) {
  if (value == null) return undefined;
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export function profileCalendarToday(timeZone = 'UTC', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function assertProfileBirthDate(value: string | null | undefined, timeZone?: string | null, now = new Date()) {
  if (!value) return;
  if (value.slice(0, 10) > profileCalendarToday(timeZone || 'UTC', now))
    throw new BadRequestException('Date of birth cannot be in the future.');
}
