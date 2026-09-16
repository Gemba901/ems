import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
describe('Real S3 presigner contract', () => {
  it('signs browser-supplied length/type without a checksum for a missing body', async () => {
    const client = new S3Client({
      region: 'eu-north-1',
      credentials: {
        accessKeyId: 'test-only-key',
        secretAccessKey: 'test-only-secret',
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    const signed = new URL(
      await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: 'test-private-bucket',
          Key: 'organizations/org-one/image.png',
          ContentType: 'image/png',
          ContentLength: 42,
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
      ),
    );
    expect(signed.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining([
        'content-type',
        'content-length',
        'if-none-match',
      ]),
    );
    expect(signed.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    client.destroy();
  });
});
