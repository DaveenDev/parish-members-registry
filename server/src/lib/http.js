/**
 * Shared HTTP helpers.
 *
 * Express 4 does not forward rejected promises from async handlers to the
 * error middleware — the rejection goes unhandled and Node exits the process.
 * Every async route must therefore be wrapped in `asyncHandler`.
 */

/** Wrap an async route handler so rejections reach Express' error middleware. */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** An error carrying an intended HTTP status code. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg) => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/**
 * Coerce a value that must be a string. Guards against JSON bodies smuggling
 * objects/arrays into places that call string methods (e.g. `email.toLowerCase()`).
 */
export function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`${label} is required`);
  }
  return value.trim();
}

/** Coerce an optional value to a trimmed string, or null. Non-strings become null. */
export function optionalString(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

/** Parse a positive integer route param, rejecting anything else with a 400. */
export function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`Invalid ${label}`);
  return n;
}

export const MAX_PAGE_SIZE = 100;

/** Parse and clamp pagination params so a client can't request the whole table. */
export function parsePaging(query = {}, { defaultSize = 10, maxSize = MAX_PAGE_SIZE } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const requested = parseInt(query.pageSize, 10) || defaultSize;
  const pageSize = Math.min(Math.max(1, requested), maxSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Restrict a value to a known set, falling back to a default. Use for anything interpolated into SQL. */
export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
