import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ProductType, PlantRoute, SteelDepartment, CreditStatus } from 'db';

export class QueryConfigListDto {
  @IsOptional()
  @IsString()
  q?: string;

  // Config admin lists show inactive records too unless the caller opts out —
  // P01/master-data lookups always filter isActive:true and never pass this.
  @IsOptional()
  includeInactive?: string;
}

// ── Products ──
export class CreateProductDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;
  @IsEnum(ProductType) productType: ProductType;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(ProductType) productType?: ProductType;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Product Specifications ──
export class CreateProductSpecificationDto {
  @IsString() @IsNotEmpty() productId: string;
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() grade: string;
  @IsString() @IsNotEmpty() size: string;
  @IsString() @IsNotEmpty() standard: string;
  @IsOptional() @IsString() length?: string;
  @IsOptional() @IsString() toleranceNotes?: string;
}

export class UpdateProductSpecificationDto {
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() standard?: string;
  @IsOptional() @IsString() length?: string;
  @IsOptional() @IsString() toleranceNotes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Production Routes ──
export class CreateProductionRouteDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;
  @IsEnum(PlantRoute) plantRoute: PlantRoute;
}

export class UpdateProductionRouteDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(PlantRoute) plantRoute?: PlantRoute;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateRouteStepDto {
  @IsString() @IsNotEmpty() processName: string;
  @IsEnum(SteelDepartment) department: SteelDepartment;
}

export class UpdateRouteStepDto {
  @IsOptional() @IsString() processName?: string;
  @IsOptional() @IsEnum(SteelDepartment) department?: SteelDepartment;
}

export class ReorderRouteStepsDto {
  @IsString({ each: true }) stepIdsInOrder: string[];
}

// ── Customers ──
export class CreateCustomerDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() defaultDeliveryLocation?: string;
  @IsOptional() @IsEnum(CreditStatus) creditStatus?: CreditStatus;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Dealers ──
export class CreateDealerDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;
  @IsOptional() @IsString() region?: string;
}

export class UpdateDealerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Materials ──
export class CreateMaterialDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() unit: string;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export type ImportEntityType =
  | 'products'
  | 'product-specifications'
  | 'customers'
  | 'dealers'
  | 'materials'
  | 'production-routes';
