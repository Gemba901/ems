import { UploadsService } from './uploads.service';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://private-upload.test'),
}));

describe('Private tenant files', () => {
  let service: UploadsService;
  let db: any;
  let send: jest.Mock;
  const asset = {
    id: 'file-one',
    organizationId: 'org-one',
    uploadedBy: 'user-one',
    status: 'PENDING',
    key: 'private-key',
    fileName: 'photo.png',
    contentType: 'image/png',
    size: 42,
  };
  beforeEach(() => {
    process.env.AWS_PRIVATE_UPLOAD_BUCKET = 'test-private-bucket';
    db = {
      $executeRaw: jest.fn(),
      fileAsset: {
        create: jest.fn().mockResolvedValue(asset),
        findFirst: jest.fn().mockResolvedValue(asset),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    db.$transaction = jest.fn(async (work: any) => work(db));
    service = new UploadsService(db);
    send = jest.fn();
    (service as any).s3 = { send };
    jest
      .spyOn(service, 'storageReadiness')
      .mockResolvedValue({ checked: true, private: true });
  });
  afterEach(() => {
    delete process.env.AWS_PRIVATE_UPLOAD_BUCKET;
    jest.clearAllMocks();
  });
  it('binds upload signatures to content type and size, and returns a managed reference', async () => {
    const result = await service.generateUploadUrl(
      'photo.png',
      'image/png',
      'images',
      'org-one',
      42,
      'user-one',
    );
    expect(result.fileUrl).toBe('/api/uploads/files/file-one');
    const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
    expect(command.input).toMatchObject({
      ContentType: 'image/png',
      ContentLength: 42,
    });
    expect(options.signableHeaders).toEqual(
      new Set(['content-type', 'content-length', 'if-none-match']),
    );
    expect(db.$executeRaw).toHaveBeenCalled();
  });
  it.each([
    ['text/html', 42],
    ['image/svg+xml', 42],
    ['image/png', 0],
    ['image/png', 20971521],
  ])('rejects unsafe type/size %s %s', async (type, size) => {
    await expect(
      service.generateUploadUrl(
        'file',
        type as string,
        'images',
        'org-one',
        size as number,
        'user-one',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.fileAsset.create).not.toHaveBeenCalled();
  });
  it('refuses to issue uploads into an unverified/public bucket', async () => {
    jest
      .spyOn(service, 'storageReadiness')
      .mockResolvedValue({ private: false, checked: true });
    await expect(
      service.generateUploadUrl(
        'photo.png',
        'image/png',
        'images',
        'org-one',
        42,
        'user-one',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('never contacts storage for another company file', async () => {
    db.fileAsset.findFirst.mockResolvedValue(null);
    await expect(service.download('file-one', 'org-two')).rejects.toMatchObject(
      { status: 404 },
    );
    expect(db.fileAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'file-one', organizationId: 'org-two', status: 'READY' },
    });
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects an uploaded object whose size or type differs', async () => {
    send.mockResolvedValue({ ContentLength: 900, ContentType: 'image/png' });
    await expect(
      service.complete('file-one', 'org-one', 'user-one'),
    ).rejects.toMatchObject({ status: 400 });
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(db.fileAsset.update).toHaveBeenCalledWith({
      where: { id: 'file-one' },
      data: { status: 'REJECTED' },
    });
  });
  it('completes a matching upload and streams only an authorized READY file', async () => {
    send.mockResolvedValueOnce({ ContentLength: 42, ContentType: 'image/png' });
    await service.complete('file-one', 'org-one', 'user-one');
    send.mockResolvedValueOnce({ Body: Readable.from('image') });
    const result = await service.download('file-one', 'org-one');
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    expect(result.getHeaders().type).toBe('image/png');
  });
});
