import { Controller, Body, Post } from '@nestjs/common';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
    constructor(private readonly uploadsService: UploadsService) { }

    @Post('presigned-url')
    async getPresignedUrl(
        @Body()
        body: {
            fileName: string;
            fileType: string;
            folder: string;
        },
    ) {
        return this.uploadsService.generateUploadUrl(
            body.fileName,
            body.fileType,
            body.folder,
        )
    }
}

