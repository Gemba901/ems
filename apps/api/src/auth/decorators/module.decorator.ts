import { SetMetadata } from "@nestjs/common";
import { ModuleType } from "db";

export const MODULE_KEY = "requiredModule";
export const RequiresModule = (module: ModuleType) => SetMetadata(MODULE_KEY, module);
