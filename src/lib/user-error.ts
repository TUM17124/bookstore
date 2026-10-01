/**
 * An error whose message is written for the user and may be shown as-is
 * (errorMessage() in auth-fetch shows it). Its own module with no imports,
 * so both api.ts and auth-fetch.ts can extend/check it without an import
 * cycle at class-definition time.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserError"
  }
}
