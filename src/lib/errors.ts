export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
export const forbidden = (m = "You are not authorized to perform this action") => new DomainError("FORBIDDEN", m, 403);
export const notFound = (m = "Not found") => new DomainError("NOT_FOUND", m, 404);
export const conflict = (code: string, m: string) => new DomainError(code, m, 409);
export const invalid = (code: string, m: string) => new DomainError(code, m, 400);
