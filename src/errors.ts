/**
 * Base error class for all Katazome errors.
 * These are expected errors that should be reported to the user and exit with code 1.
 */
export class KatazomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KatazomeError";
  }
}
