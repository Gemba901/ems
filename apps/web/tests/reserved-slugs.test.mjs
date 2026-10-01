import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RESERVED_SLUGS, SIGNUP_RESERVED_SLUGS, SIGNUP_RESERVED_TERMS, isReservedSignupSlug } from '../lib/reserved-slugs.mjs';

const api = readFileSync(new URL('../../api/src/common/utils/organization-slug.ts', import.meta.url), 'utf8');
const apiList = name => {
  const match = api.match(new RegExp(`export const ${name} = (?:new Set\\()?\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} not found in the API source`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
};

test('web reserved slug lists match the API', () => {
  assert.deepEqual([...RESERVED_SLUGS].sort(), apiList('RESERVED_ORGANIZATION_SLUGS'));
  assert.deepEqual([...SIGNUP_RESERVED_SLUGS].sort(), apiList('SIGNUP_RESERVED_ORGANIZATION_SLUGS'));
  assert.deepEqual([...SIGNUP_RESERVED_TERMS].sort(), apiList('SIGNUP_RESERVED_ORGANIZATION_SLUG_TERMS'));
});

test('signup refuses platform names, phishing terms and brand names', () => {
  for (const slug of ['admin', 'login', 'gemba-plastics', 'my-bees']) assert.equal(isReservedSignupSlug(slug), true, slug);
  assert.equal(isReservedSignupSlug('acme-steel'), false);
});
