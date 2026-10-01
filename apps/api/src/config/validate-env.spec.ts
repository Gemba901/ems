import { validateEnv } from './validate-env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'j'.repeat(48),
  TENANT_PROXY_SECRET: 'p'.repeat(64),
};

describe('validateEnv', () => {
  it('accepts a complete environment without CORS', () => {
    expect(validateEnv(valid)).toEqual([]);
  });

  it('lists every missing required variable', () => {
    expect(validateEnv({})).toEqual([
      'DATABASE_URL is required',
      'JWT_SECRET is required',
      'TENANT_PROXY_SECRET is required',
    ]);
  });

  it('rejects reusing the proxy secret as the JWT secret', () => {
    expect(validateEnv({ ...valid, JWT_SECRET: valid.TENANT_PROXY_SECRET })).toEqual([
      'JWT_SECRET and TENANT_PROXY_SECRET must be different secrets',
    ]);
  });

  it('accepts bare origins and rejects paths, wildcards and http in production', () => {
    expect(validateEnv({ ...valid, CORS_ORIGINS: 'https://a.example.com, http://localhost:3000' })).toEqual([]);
    const problems = validateEnv({ ...valid, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example.com/app,*,http://b.example.com' });
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).not.toContain(valid.JWT_SECRET);
  });
});
