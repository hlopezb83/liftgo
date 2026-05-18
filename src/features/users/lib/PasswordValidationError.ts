export class PasswordValidationError extends Error {
  readonly code: "weak_password" | "pwned";
  readonly raw: string | undefined;

  constructor(message: string, code: "weak_password" | "pwned", raw?: string) {
    super(message);
    this.name = "PasswordValidationError";
    this.code = code;
    this.raw = raw;
  }
}
