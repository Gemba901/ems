import { Role } from '../common/enum/role.enum';
import { isAccessTokenPayload } from './access-token-payload';

describe('isAccessTokenPayload', () => {
  const valid = {
    tokenType: 'ACCESS', userId: 'user-one', organizationId: 'org-one',
    roleId: 2, roleLevel: Role.ADMIN, email: null, isAdminOrg: false,
    exp: 2_000_000_000,
  };

  it.each([null, 'admin@example.test'])('accepts an access payload with email %s', (email) => {
    expect(isAccessTokenPayload({ ...valid, email })).toBe(true);
  });

  it.each([undefined, null, false, 123, 'token', [], {}])('rejects a non-payload value (%#)', (value) => {
    expect(isAccessTokenPayload(value)).toBe(false);
  });

  it.each(Object.keys(valid))('requires claim %s', (key) => {
    const payload: Record<string, unknown> = { ...valid };
    delete payload[key];
    expect(isAccessTokenPayload(payload)).toBe(false);
  });

  it.each([
    ['tokenType', 'REFRESH'], ['userId', ''], ['userId', '  '], ['userId', 1],
    ['organizationId', null], ['organizationId', ''], ['organizationId', '  '],
    ['roleId', 0], ['roleId', -1], ['roleId', 1.5], ['roleId', '2'],
    ['roleLevel', 'UNKNOWN'], ['roleLevel', 'admin'],
    ['email', 123], ['isAdminOrg', 'true'],
    ['exp', '2000000000'], ['exp', Infinity], ['exp', NaN],
  ])('rejects malformed %s (%#)', (key, value) => {
    expect(isAccessTokenPayload({ ...valid, [key as string]: value })).toBe(false);
  });

  it.each(['FIRST_TIME_SETUP', 'PASSWORD_RESET_SETUP', 'ORG_SELECTION'])('rejects purpose %s even with ACCESS type', (purpose) => {
    expect(isAccessTokenPayload({ ...valid, purpose })).toBe(false);
  });
});
