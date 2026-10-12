export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what);
export const forbidden = (why: string) => new HttpError(403, 'forbidden', why);
export const invalid = (message: string, details: Record<string, unknown> = {}) =>
  new HttpError(422, 'validation_failed', message, details);
export const conflict = (code: string, message: string, details: Record<string, unknown> = {}) =>
  new HttpError(409, code, message, details);
