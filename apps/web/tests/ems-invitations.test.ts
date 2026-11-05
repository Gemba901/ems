import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationBadge, sharedContactResults, whatsappLink } from '../components/ems/ems-invitations';

test('WhatsApp links use international digits and carry the message', () => {
  assert.equal(whatsappLink('+254 712 345 678', 'Hi & welcome'), 'https://wa.me/254712345678?text=Hi%20%26%20welcome');
  assert.equal(whatsappLink('00254712345678', 'x'), 'https://wa.me/254712345678?text=x');
  assert.equal(whatsappLink('123', 'x'), null);
});

test('list badges show only while an invitation is under way or needs attention', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  assert.equal(invitationBadge(null, now), null);
  assert.equal(invitationBadge({ status: 'ACCEPTED', kind: 'SETUP', expiresAt: null }, now), null);
  assert.equal(invitationBadge({ status: 'NOTICE_SENT', kind: 'ACCESS_NOTICE', expiresAt: null }, now), null);
  assert.deepEqual(invitationBadge({ status: 'SENT', kind: 'SETUP', expiresAt: '2026-10-30T00:00:00Z' }, now), { label: 'Invite pending', tone: 'info' });
  assert.deepEqual(invitationBadge({ status: 'SHARED', kind: 'SETUP', expiresAt: '2026-10-01T00:00:00Z' }, now), { label: 'Invite expired', tone: 'warn' });
  assert.deepEqual(invitationBadge({ status: 'SKIPPED', kind: 'SETUP', expiresAt: null, skipReason: 'No email address' }, now), { label: 'Not invited: No email address', tone: 'warn' });
  assert.deepEqual(invitationBadge({ status: 'NOTICE_SENT', kind: 'CONTACT_NOTICE', expiresAt: null }, now), { label: 'Shared contact: review required', tone: 'warn' });
});

test('failed shared-contact email never claims the notice was sent', () => {
  const [person] = sharedContactResults({ channel: 'EMAIL',
    inPerson: [{ employeeId: 'jane', name: 'Jane Test' }],
    failures: [{ employeeId: 'jane' }], share: [] });
  assert.equal(person.failed, true);
  assert.equal(person.outcome, 'Notice could not be sent.');
});

test('mixed email outcomes match employee IDs even when names are identical', () => {
  const people = sharedContactResults({ channel: 'EMAIL',
    inPerson: [{ employeeId: 'one', name: 'Jane Test' }, { employeeId: 'two', name: 'Jane Test' }],
    failures: [{ employeeId: 'two' }, { employeeId: 'other' }], share: [] });
  assert.deepEqual(people.map(p => p.outcome), ['Notice sent by email.', 'Notice could not be sent.']);
});

test('WhatsApp prepared notices do not claim delivery and failures take precedence', () => {
  const people = sharedContactResults({ channel: 'WHATSAPP',
    inPerson: [{ employeeId: 'one', name: 'One' }, { employeeId: 'two', name: 'Two' }, { employeeId: 'three', name: 'Three' }],
    failures: [{ employeeId: 'two' }],
    share: [{ employeeId: 'one', kind: 'CONTACT_NOTICE' }, { employeeId: 'two', kind: 'CONTACT_NOTICE' }] });
  assert.deepEqual(people.map(p => p.outcome), [
    'Notice prepared for WhatsApp; sending is not confirmed.',
    'Notice could not be sent.', 'Notice sending is not confirmed.',
  ]);
});

test('unrelated invitation failures do not create shared-contact results', () => {
  assert.deepEqual(sharedContactResults({ channel: 'EMAIL', inPerson: [], failures: [{ employeeId: 'other' }], share: [] }), []);
});

test('passwordless existing-account notices remain visible as needing verification', () => {
  assert.deepEqual(invitationBadge({ status: 'NOTICE_SENT', kind: 'ACCESS_NOTICE', expiresAt: null,
    skipReason: 'Account verification required' }), { label: 'Account verification required', tone: 'warn' });
});

test('account-link requests stay visible until acceptance and show declined requests', () => {
  assert.deepEqual(invitationBadge({ kind: 'ACCOUNT_LINK', status: 'SKIPPED', expiresAt: null }), { label: 'Account verification required', tone: 'warn' });
  assert.deepEqual(invitationBadge({ kind: 'ACCOUNT_LINK', status: 'SKIPPED', expiresAt: null, skipReason: 'The person declined account linking; HR review required' }), { label: 'Account link declined', tone: 'warn' });
  assert.equal(invitationBadge({ kind: 'ACCOUNT_LINK', status: 'ACCEPTED', expiresAt: null }), null);
});
