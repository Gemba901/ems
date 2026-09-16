import { companyUploadKey } from './upload-key';

describe('Company upload keys', () => {
  it('uses the company prefix and a fresh key for each upload', () => {
    const first = companyUploadKey('org-one', 'avatars', 'my photo.png');
    expect(first).toMatch(
      /^organizations\/org-one\/avatars\/[a-f0-9-]+-my_photo.png$/,
    );
    expect(companyUploadKey('org-one', 'avatars', 'my photo.png')).not.toBe(
      first,
    );
    expect(companyUploadKey('org-two', 'avatars', 'my photo.png')).toMatch(
      /^organizations\/org-two\//,
    );
  });
  it.each(['../org-two', '/absolute', 'a/../b', 'a\\b', ''])(
    'rejects folder %s',
    (folder) => {
      expect(() => companyUploadKey('org-one', folder, 'photo.png')).toThrow();
    },
  );
  it.each(['../photo.png', 'a\\b.png', '', 'bad\nname.png'])(
    'rejects filename %s',
    (name) => {
      expect(() => companyUploadKey('org-one', 'avatars', name)).toThrow();
    },
  );
});
