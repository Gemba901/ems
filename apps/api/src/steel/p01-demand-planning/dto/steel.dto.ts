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
  IsIn,
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

  // Selected master-data customer. When provided, customerName/dealerName are
  // derived from the Customer record rather than free-typed.
  @IsString()
  @IsOptional()
  customerId?: string;

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
  // Optional: when omitted, the service defaults this from the plan's
  // demandSource (see steel.service.ts confirmPriority). Overriding the
  // default to something other than NORMAL requires `notes` explaining why.
  @IsEnum(OrderPriority, { message: 'Invalid priority' })
  @IsOptional()
  priority?: OrderPriority;

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
  // Selected master-data product. When provided, productType is derived from
  // it and need not be repeated.
  @IsString()
  @IsOptional()
  productId?: string;

  @IsEnum(ProductType, { message: 'Invalid product type' })
  @IsOptional()
  productType?: ProductType;

  @IsString()
  @IsOptional()
  productStandard?: string;

  @IsString()
  @IsOptional()
  customerSpecification?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// P01-A04 — Confirm grade, size, length, bundle, and quantity
export class ConfirmSteelSpecificationDto {
  // Selected master-data specification. When provided, grade/size/length/
  // toleranceNotes are derived from it rather than free-typed.
  @IsString()
  @IsOptional()
  productSpecificationId?: string;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsString()
  @IsOptional()
  size?: string;

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
  // Optional: when omitted, the service auto-fills this (and the arrays
  // below) from SteelFinishedGoodsStock against the plan's
  // productSpecificationId (see steel.service.ts checkStock).
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  certifiedStockAvailableQty?: number;

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
  // Optional: when omitted, the service defaults this from the shortfall
  // between certifiedStockAvailableQty and requestedQuantityTonnes (see
  // steel.service.ts decideStockOrProduction). Overriding that suggestion
  // requires stockDecisionNotes explaining why.
  @IsEnum(StockDecision, { message: 'Invalid stock decision' })
  @IsOptional()
  stockDecision?: StockDecision;

  @IsString()
  @IsOptional()
  stockDecisionNotes?: string;
}

// P01-A07 — Select applicable plant route
export class SelectSteelRouteDto {
  // Selected master-data route. When provided, plantRoute is derived from it.
  @IsString()
  @IsOptional()
  productionRouteId?: string;

  @IsEnum(PlantRoute, { message: 'Invalid plant route' })
  @IsOptional()
  plantRoute?: PlantRoute;

  @IsString()
  @IsOptional()
  routeNotes?: string;
}

// P01-A08 — Check raw material or billet availability
export class SteelMaterialCheckDto {
  @IsEnum(AvailabilityStatus, {
    message: 'Invalid material availability status',
  })
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
  @IsEnum(AvailabilityStatus, {
    message: 'Invalid equipment availability status',
  })
  equipmentAvailability!: AvailabilityStatus;

  @IsEnum(AvailabilityStatus, {
    message: 'Invalid manpower availability status',
  })
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
  // Optional: when omitted, the service derives the department list from the
  // plan's selected production route steps (see steel.service.ts
  // communicatePlan).
  @IsArray()
  @IsEnum(SteelDepartment, { each: true, message: 'Invalid department' })
  @IsOptional()
  departments?: SteelDepartment[];

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

  // Scopes to plans that have an internal production schedule set
  // (plannedStartDate, captured at P01-A10 — the actual shop-floor
  // scheduling step, as opposed to expectedDeliveryDate/deliveryPromiseDate
  // which are customer-facing dates captured earlier at A01/A02).
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  scheduledOnly?: boolean;

  // Date-range filter on the same canonical scheduling field
  // (plannedStartDate). Cross-field ordering (fromDate <= toDate) is
  // checked in the service, since class-validator has no built-in
  // cross-property comparator without a custom decorator.
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @IsDateString()
  @IsOptional()
  toDate?: string;

  @IsIn(['createdAt', 'plannedStartDate'])
  @IsOptional()
  sortBy?: 'createdAt' | 'plannedStartDate' = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';

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
