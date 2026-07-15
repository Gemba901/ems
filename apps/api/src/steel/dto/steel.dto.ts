import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsArray,
  IsDateString,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DemandSource,
  OrderPriority,
  CreditStatus,
  ProductType,
  StockDecision,
  PlantRoute,
  AvailabilityStatus,
  SteelPlanStage,
  SteelPlanOverallStatus,
  SteelDepartment,
} from 'db';

// P01-A01 — Capture customer enquiry, sales order, forecast, or stock requirement
export class CreateSteelDemandDto {
  @IsEnum(DemandSource, { message: 'Invalid demand source' })
  demandSource!: DemandSource;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  dealerName?: string;

  @IsString()
  @IsOptional()
  projectReference?: string;

  @IsString()
  @IsOptional()
  salesOrderNumber?: string;

  @IsString()
  @IsOptional()
  forecastReference?: string;

  @IsString()
  @IsOptional()
  stockRequirementReference?: string;

  @IsDateString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Requested quantity must be greater than zero' })
  requestedQuantityTonnes!: number;

  @IsString()
  @IsOptional()
  demandNotes?: string;
}

// P01-A02 — Confirm customer and order priority
export class ConfirmSteelPriorityDto {
  @IsEnum(OrderPriority, { message: 'Invalid priority' })
  priority!: OrderPriority;

  @IsDateString()
  @IsOptional()
  deliveryPromiseDate?: string;

  @IsEnum(CreditStatus, { message: 'Invalid credit status' })
  @IsOptional()
  creditStatus?: CreditStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

// P01-A03 — Confirm product type and standard required
export class ConfirmSteelProductDto {
  @IsEnum(ProductType, { message: 'Invalid product type' })
  productType!: ProductType;

  @IsString()
  @IsNotEmpty({ message: 'Product standard is required' })
  productStandard!: string;

  @IsString()
  @IsOptional()
  customerSpecification?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// P01-A04 — Confirm grade, size, length, bundle, and quantity
export class ConfirmSteelSpecificationDto {
  @IsString()
  @IsNotEmpty({ message: 'Grade is required' })
  grade!: string;

  @IsString()
  @IsNotEmpty({ message: 'Size is required' })
  size!: string;

  @IsString()
  @IsOptional()
  length?: string;

  @IsString()
  @IsOptional()
  bundleType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Total quantity must be greater than zero' })
  totalQuantity!: number;

  @IsString()
  @IsOptional()
  toleranceNotes?: string;
}

// P01-A05 — Check certified finished goods stock
export class SteelStockCheckDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  certifiedStockAvailableQty!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  stockBundleIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  stockHeatNumbers?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  stockCertificateRefs?: string[];
}

// P01-A06 — Decide dispatch from stock or production required
export class SteelStockDecisionDto {
  @IsEnum(StockDecision, { message: 'Invalid stock decision' })
  stockDecision!: StockDecision;

  @IsString()
  @IsOptional()
  stockDecisionNotes?: string;
}

// P01-A07 — Select applicable plant route
export class SelectSteelRouteDto {
  @IsEnum(PlantRoute, { message: 'Invalid plant route' })
  plantRoute!: PlantRoute;

  @IsString()
  @IsOptional()
  routeNotes?: string;
}

// P01-A08 — Check raw material or billet availability
export class SteelMaterialCheckDto {
  @IsEnum(AvailabilityStatus, { message: 'Invalid material availability status' })
  materialAvailability!: AvailabilityStatus;

  @IsString()
  @IsOptional()
  materialShortageNotes?: string;

  @IsString()
  @IsOptional()
  purchaseRequirementNotes?: string;
}

// P01-A09 — Check equipment, maintenance, and manpower availability
export class SteelCapacityCheckDto {
  @IsEnum(AvailabilityStatus, { message: 'Invalid equipment availability status' })
  equipmentAvailability!: AvailabilityStatus;

  @IsEnum(AvailabilityStatus, { message: 'Invalid manpower availability status' })
  manpowerAvailability!: AvailabilityStatus;

  @IsString()
  @IsOptional()
  maintenanceShutdownNotes?: string;

  @IsString()
  @IsOptional()
  shiftPlanNotes?: string;
}

// P01-A10 — Prepare production plan and sequence
export class SteelProductionSequenceItemDto {
  @IsString()
  @IsNotEmpty()
  batch!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantityTonnes?: number;

  @IsString()
  @IsOptional()
  sequenceDate?: string;
}

export class PrepareSteelProductionPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SteelProductionSequenceItemDto)
  productionSequence!: SteelProductionSequenceItemDto[];

  @IsDateString()
  @IsOptional()
  plannedStartDate?: string;

  @IsDateString()
  @IsOptional()
  plannedEndDate?: string;

  @IsString()
  @IsOptional()
  planNotes?: string;
}

// P01-A11 — Communicate plan to all concerned departments
export class CommunicateSteelPlanDto {
  @IsArray()
  @IsEnum(SteelDepartment, { each: true, message: 'Invalid department' })
  departments!: SteelDepartment[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AckSteelPlanDepartmentDto {
  @IsBoolean()
  @IsOptional()
  acknowledged?: boolean = true;

  @IsString()
  @IsOptional()
  notes?: string;
}

// P01-A12 — Release approved production plan
export class ReleaseSteelPlanDto {
  @IsString()
  @IsOptional()
  releaseNotes?: string;
}

export class UpdateSteelPlanStatusDto {
  @IsEnum(SteelPlanOverallStatus, { message: 'Invalid status' })
  status!: SteelPlanOverallStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QuerySteelPlansDto {
  @IsEnum(SteelPlanStage)
  @IsOptional()
  stage?: SteelPlanStage;

  @IsEnum(SteelPlanOverallStatus)
  @IsOptional()
  status?: SteelPlanOverallStatus;

  @IsEnum(OrderPriority)
  @IsOptional()
  priority?: OrderPriority;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit: number = 10;
}
