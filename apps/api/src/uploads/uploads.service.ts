import { tenantTransaction } from '../prisma/tenant-transaction';
import { companyUploadKey } from './upload-key';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import { Readable } from 'node:stream';
import { SAFE_IMAGE_TYPES, validateUpload } from './upload-policy';

@Injectable()
export class UploadsService {
  private readonly s3 = new S3Client({
    region: process.env.AWS_REGION,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 20000 },
  });
  constructor(private readonly db: PrismaService) {}
  private bucket() {
    const name =
      process.env.AWS_PRIVATE_UPLOAD_BUCKET ||
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET;
    if (!name) throw new Error('Configure the private upload bucket');
    return name;
  }
  async generateUploadUrl(
    fileName: string,
    fileType: string,
    folder: string,
    organizationId: string,
    size: number,
    uploadedBy: string,
  ) {
    validateUpload(fileType, size);
    if (!(await this.storageReadiness()).private)
      throw new ServiceUnavailableException(
        'Private upload storage is not ready',
      );
    const key = companyUploadKey(organizationId, folder, fileName);
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        ContentType: fileType,
        ContentLength: size,
        IfNoneMatch: '*',
      }),
      {
        expiresIn: 60,
        signableHeaders: new Set([
          'content-type',
          'content-length',
          'if-none-match',
        ]),
      },
    );
    const asset = await tenantTransaction(this.db, organizationId, (tx) =>
      tx.fileAsset.create({
        data: {
          organizationId,
          uploadedBy,
          key,
          fileName,
          contentType: fileType,
          size,
          folder,
        },
      }),
    );
    return {
      id: asset.id,
      uploadHeaders: { 'Content-Type': fileType, 'If-None-Match': '*' },
      uploadUrl,
      fileUrl: `/api/uploads/files/${asset.id}`,
      key,
    };
  }
  async complete(id: string, organizationId: string, uploadedBy: string) {
    const asset = await tenantTransaction(this.db, organizationId, (tx) =>
      tx.fileAsset.findFirst({ where: { id, organizationId, uploadedBy } }),
    );
    if (!asset) throw new NotFoundException('File not found');
    if (asset.status === 'READY')
      return { fileUrl: `/api/uploads/files/${id}` };
    if (asset.status !== 'PENDING')
      throw new BadRequestException('Upload rejected');
    const object = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket(), Key: asset.key }),
    );
    if (
      object.ContentLength !== asset.size ||
      object.ContentType !== asset.contentType
    ) {
      await tenantTransaction(this.db, organizationId, (tx) =>
        tx.fileAsset.update({ where: { id }, data: { status: 'REJECTED' } }),
      );
      throw new BadRequestException(
        'Uploaded file does not match its declaration',
      );
    }
    await tenantTransaction(this.db, organizationId, (tx) =>
      tx.fileAsset.updateMany({
        where: { id, organizationId, status: 'PENDING' },
        data: { status: 'READY' },
      }),
    );
    return { fileUrl: `/api/uploads/files/${id}` };
  }
  async download(id: string, organizationId: string) {
    const asset = await tenantTransaction(this.db, organizationId, (tx) =>
      tx.fileAsset.findFirst({
        where: { id, organizationId, status: 'READY' },
      }),
    );
    if (!asset) throw new NotFoundException('File not found');
    const object = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket(), Key: asset.key }),
    );
    if (!object.Body) throw new NotFoundException('File not found');
    const filename = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return new StreamableFile(object.Body as Readable, {
      type: asset.contentType,
      disposition: `${SAFE_IMAGE_TYPES.has(asset.contentType) ? 'inline' : 'attachment'}; filename="${filename}"`,
    });
  }
  async storageReadiness() {
    try {
      const [block, policy] = await Promise.all([
        this.s3.send(
          new GetPublicAccessBlockCommand({ Bucket: this.bucket() }),
        ),
        this.s3
          .send(new GetBucketPolicyStatusCommand({ Bucket: this.bucket() }))
          .catch((error) => {
            if (error?.name === 'NoSuchBucketPolicy')
              return { PolicyStatus: { IsPublic: false } };
            throw error;
          }),
      ]);
      const settings = block.PublicAccessBlockConfiguration;
      return {
        private: !!(
          settings?.BlockPublicAcls &&
          settings.IgnorePublicAcls &&
          settings.BlockPublicPolicy &&
          settings.RestrictPublicBuckets &&
          policy.PolicyStatus?.IsPublic === false
        ),
        checked: true,
      };
    } catch {
      return { private: false, checked: false };
    }
  }
}
