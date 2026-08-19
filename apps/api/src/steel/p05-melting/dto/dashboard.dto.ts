import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';

export enum MeltingDashboardRange {
  TODAY = 'TODAY',
  SEVEN_DAYS = '7D',
  THIRTY_DAYS = '30D',
  CUSTOM = 'CUSTOM',
}

// P05 management dashboard — aggregated read, no writes. `range` picks a
// rolling window server-side; CUSTOM requires from/to. furnaceId scopes
// every section (KPIs, active heats, furnace/lining status, history) to one
// furnace when set.
export class GetMeltingDashboardDto {
  @IsEnum(MeltingDashboardRange)
  @IsOptional()
  range?: MeltingDashboardRange;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsUUID()
  @IsOptional()
  furnaceId?: string;
}
