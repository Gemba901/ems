import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ProductType, SteelMaterialType } from 'db';

export class SearchQueryDto {
  @IsString()
  @IsOptional()
  q?: string;
}

export class QueryProductsDto extends SearchQueryDto {
  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;
}

export class QueryProductSpecificationsDto extends SearchQueryDto {
  @IsString()
  @IsOptional()
  productId?: string;
}

export class QueryFinishedGoodsStockDto {
  @IsString()
  productSpecificationId!: string;
}

// Best-effort availability check against P03 material intake records, since
// no separate raw-material stock ledger exists yet — see SteelMaterialMaster
// comment. `materialType` reuses the existing SteelMaterialType enum already
// recorded on SteelMaterialIntake, rather than introducing a parallel
// classification tied to the new SteelMaterialMaster catalog.
export class QueryMaterialAvailabilityDto {
  @IsEnum(SteelMaterialType)
  materialType!: SteelMaterialType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requiredQtyTonnes!: number;
}
