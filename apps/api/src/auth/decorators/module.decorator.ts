import { SetMetadata } from "@nestjs/common";
import { ModuleType } from "db";

export const MODULE_KEY = "requiredModule";
export const RequiresModule = (module: ModuleType) => SetMetadata(MODULE_KEY, module);
/** Opts a handler out of a class-level @RequiresModule (handler metadata overrides class metadata). */
export const SkipModuleCheck = () => SetMetadata(MODULE_KEY, null);
