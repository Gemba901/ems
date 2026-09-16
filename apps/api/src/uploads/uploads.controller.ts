import { TenantRequired } from '../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { TenantRequest } from '../tenancy/tenant-context';
import {
  Controller,
  Body,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
  Header,
} from '@nestjs/common';
import { IsInt, IsString, Length, Min, Max } from 'class-validator';
import { UploadsService } from './uploads.service';
import { MAX_UPLOAD_BYTES } from './upload-policy';
class UploadDto {
  @IsString() @Length(1, 200) fileName!: string;
  @IsString() @Length(1, 150) fileType!: string;
  @IsString() @Length(1, 100) folder!: string;
  @IsInt() @Min(1) @Max(MAX_UPLOAD_BYTES) size!: number;
}
@Controller('uploads')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}
  @Post('presigned-url')
  getPresignedUrl(@Req() req: TenantRequest, @Body() body: UploadDto) {
    return this.uploadsService.generateUploadUrl(
      body.fileName,
      body.fileType,
      body.folder,
      req.tenant!.organizationId,
      body.size,
      req.user!.userId,
    );
  }
  @Post(':id/complete') complete(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    return this.uploadsService.complete(
      id,
      req.tenant!.organizationId,
      req.user!.userId,
    );
  }
  @Get('files/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  download(@Req() req: TenantRequest, @Param('id') id: string) {
    return this.uploadsService.download(id, req.tenant!.organizationId);
  }
}
