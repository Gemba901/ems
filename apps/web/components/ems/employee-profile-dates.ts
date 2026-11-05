import type { UpdateEmployeeEmsPayload } from '@/services/ems.service';

export function localCalendarToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function profileSavePayload(form: UpdateEmployeeEmsPayload): UpdateEmployeeEmsPayload {
  const payload = {...form};
  delete payload.employmentStatus; // Only the separate confirmed status action may change it.
  for (const field of ['dateOfBirth', 'dateJoined'] as const) {
    const value = payload[field]?.trim();
    if (!value) delete payload[field];
    else payload[field] = value;
  }
  return payload;
}
