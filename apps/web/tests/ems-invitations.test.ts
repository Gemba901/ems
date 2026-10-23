import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationBadge, whatsappLink } from '../components/ems/ems-invitations';

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
  assert.deepEqual(invitationBadge({ status: 'NOTICE_SENT', kind: 'CONTACT_NOTICE', expiresAt: null }, now), { label: 'Needs in-person setup', tone: 'warn' });
});
