// Pure claim-eligibility rules for the /me "self-claim unmapped usage" surface.
// An email-shaped externalId is claimable ONLY when it exactly (case-insensitively)
// equals the viewer's own verified email — a member's own email auto-claims on
// registration, so a manual email claim can only ever be an attempt to grab a
// coworker's usage. Non-email tool IDs (openai "user-xxx", github handle) stay
// manually claimable because the member is the one who recognizes them as theirs.

// Email-shaped: a non-empty local part, "@", a non-empty domain, no whitespace.
export function isEmailId(externalId: string): boolean {
  return /^[^@\s]+@[^@\s]+$/.test(externalId);
}

export function canClaim(externalId: string, viewerEmail: string): boolean {
  if (!isEmailId(externalId)) return true;
  return externalId.toLowerCase() === viewerEmail.toLowerCase();
}
