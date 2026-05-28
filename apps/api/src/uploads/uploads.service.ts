import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadsService {
    private s3 = new S3Client({
        region: process.env.AWS_REGION!,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });

    private getBucketName() {
        return process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;
    }

    async generateUploadUrl(
        fileName: string,
        fileType: string,
        folder: string,
    ) {
        const bucket = this.getBucketName();
        if (!bucket) {
            throw new Error("Missing AWS S3 bucket name. Set AWS_S3_BUCKET_NAME or AWS_S3_BUCKET.");
        }

        const key = `${folder}/${Date.now()}-${fileName}`;

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: fileType,
        });

        const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 60 });

        const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

            return {
                uploadUrl,
                fileUrl,
                key,
            };
        }
}
