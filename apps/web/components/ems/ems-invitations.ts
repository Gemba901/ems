/** Shared helpers for employee account invitations (web). */
export type InvitationStatus = 'SENT' | 'SHARED' | 'NOTICE_SENT' | 'ACCEPTED' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
export type InvitationKind = 'SETUP' | 'ACCESS_NOTICE' | 'CONTACT_NOTICE';
export type InvitationSummary = { status: InvitationStatus; kind: InvitationKind; expiresAt: string | null; skipReason?: string | null };

/** A click-to-chat link that opens WhatsApp on this device with the message filled in. HR presses send. */
export function whatsappLink(number: string, message: string): string | null {
  let digits = number.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 9 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * A short badge for the employee list, shown only while an invitation needs attention or is under way.
 * Returns null once someone has access, or if they were never invited.
 */
export function invitationBadge(invitation: InvitationSummary | null | undefined, now = new Date()): { label: string; tone: 'info' | 'warn' } | null {
  if (!invitation) return null;
  const expired = !!invitation.expiresAt && new Date(invitation.expiresAt) <= now;
  switch (invitation.status) {
    case 'SENT': case 'SHARED': return expired ? { label: 'Invite expired', tone: 'warn' } : { label: 'Invite pending', tone: 'info' };
    case 'FAILED': return { label: 'Invite failed', tone: 'warn' };
    case 'SKIPPED': return { label: `Not invited: ${invitation.skipReason ?? 'skipped'}`, tone: 'warn' };
    case 'CANCELLED': return { label: 'Invite cancelled', tone: 'warn' };
    case 'NOTICE_SENT': return invitation.kind === 'CONTACT_NOTICE' ? { label: 'Needs in-person setup', tone: 'warn' } : null;
    default: return null;
  }
}

export const INVITATION_STATUS_TEXT: Record<InvitationStatus, string> = {
  SENT: 'Link sent by email', SHARED: 'Link prepared for WhatsApp', NOTICE_SENT: 'Notice sent (no link)',
  ACCEPTED: 'Accepted · password created', FAILED: 'Sending failed', CANCELLED: 'Link cancelled', SKIPPED: 'Not invited',
};
