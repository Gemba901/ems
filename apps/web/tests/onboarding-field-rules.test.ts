import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingNameIssue as web } from '../components/ems/onboarding-name-rule';
import { onboardingNameIssue as api } from '../../api/src/ems/onboarding-name-rule';

// Exercise the exact API and editor implementations, including non-BMP letters.
test('API and editor agree on names without rewriting the original value', () => {
  for (const value of [undefined, null, '', ' ', 'J', 'J.', '12', 'É', 'E\u0301', 'Éa', 'E\u0301a', '李', '李明', '𐐀', '𐐀𐐁', 'Anne-Marie', "O’Neil", 'عبد']) {
    assert.equal(web(value), api(value), String(value));
  }
});
test('two letters are enough; formatting cannot pad a one-letter name', () => {
  assert.equal(web('Li'), null);
  assert.equal(web(' J - '), 'Enter at least 2 letters.');
  assert.equal(web(''), 'Required');
});
