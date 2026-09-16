import { managedFileIds } from './upload-policy';
describe('Managed file references', () => {
  it('collects nested file references without counting duplicates', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect([
      ...managedFileIds({
        evidence: [`/api/uploads/files/${id}`],
        nested: { photo: `/api/uploads/files/${id}` },
      }),
    ]).toEqual([id]);
  });
  it('rejects malformed managed paths', () => {
    expect(() => managedFileIds('/api/uploads/files/../secret')).toThrow();
  });
});
