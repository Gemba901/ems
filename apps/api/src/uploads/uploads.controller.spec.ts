import { UploadsController } from './uploads.controller';
describe('Upload controller context', () => {
  it('uses authenticated tenant and actor, never body ownership', async () => {
    const service = { generateUploadUrl: jest.fn() };
    const controller = new UploadsController(service as any);
    await controller.getPresignedUrl(
      {
        tenant: { organizationId: 'org-one' },
        user: { userId: 'actor' },
      } as any,
      {
        fileName: 'photo.png',
        fileType: 'image/png',
        folder: 'images',
        size: 42,
      },
    );
    expect(service.generateUploadUrl).toHaveBeenCalledWith(
      'photo.png',
      'image/png',
      'images',
      'org-one',
      42,
      'actor',
    );
  });
});
