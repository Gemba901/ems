// Kept byte-for-byte identical to the web onboarding-name-rule helper.
// Count letters, not UTF-16 length, spaces, punctuation, digits or combining marks.
export function onboardingNameIssue(value?: string | null): string | null {
  if (!value?.trim()) return 'Required';
  const letters = value.normalize('NFC').match(/\p{L}/gu) ?? [];
  return letters.length < 2 ? 'Enter at least 2 letters.' : null;
}
