// A02's payload (IdentifyMaterialTypePayload) only carries a materialType enum
// and a free-text note — there's no materialId FK on SteelSourcingOrder. To
// still make the confirmed Material Master record traceable and re-derivable
// (by S1 after a refresh, and by S3 for supplier eligibility) without adding
// a new field, the selected material's code is encoded as a recognizable
// prefix in materialTypeNotes, the one existing field available for it.
const MATERIAL_NOTE_PREFIX = "Material Master: ";

export function encodeMaterialNotes(code: string, userNotes: string): string {
  const tag = `${MATERIAL_NOTE_PREFIX}${code}`;
  return userNotes ? `${tag} — ${userNotes}` : tag;
}

export function decodeMaterialCode(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/^Material Master: (\S+)/);
  return match ? match[1] : null;
}

export function decodeUserNotes(notes: string | null): string | null {
  if (!notes) return null;
  if (!notes.startsWith(MATERIAL_NOTE_PREFIX)) return notes;
  const sepIdx = notes.indexOf(" — ");
  return sepIdx === -1 ? null : notes.slice(sepIdx + 3);
}
