/**
 * Saved setup is revisioned on the server: each record carries a
 * `revision`, and a save states the revision it was based on
 * (`expectedRevision`). If someone else saved in between, the server
 * refuses with 409 rather than silently overwriting their change; a
 * save of an existing record that states no revision at all is 428.
 * Both carry the current revision. The mock service applies the same
 * rule through nextRevision() below, so demo mode behaves the same.
 */
export class RevisionConflictError extends Error {
  constructor(public status: 409 | 428, public currentRevision: number) {
    super(
      status === 409
        ? `Someone else saved this after you opened it (it is now at revision ${currentRevision}). ` +
            "Your changes were not saved. Reload to see the latest version, then re-apply your edits."
        : "This was saved from an out-of-date screen. Your changes were not saved. Reload and try again."
    );
    this.name = "RevisionConflictError";
  }
}

/** Mirrors the backend's persistence/revisions.py next_revision(). */
export function nextRevision(current: number | undefined, expected: number | undefined): number {
  if (current === undefined) {
    if (expected !== undefined && expected !== 0) throw new RevisionConflictError(409, 0);
    return 1;
  }
  if (expected === undefined) throw new RevisionConflictError(428, current);
  if (expected !== current) throw new RevisionConflictError(409, current);
  return current + 1;
}

/** The message to show when a save fails -- never swallowed silently. */
export function saveErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
