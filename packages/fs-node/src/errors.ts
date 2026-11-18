/**
 * The code of a Node file system error.
 *
 * @param error - Anything thrown by `node:fs`.
 * @returns Its `code` (`ENOENT`, `EACCES`…), `UNKNOWN` otherwise: only it is reported, never the absolute path.
 *
 * @example
 * errorCode(Object.assign(new Error(), { code: 'ENOENT' })); // 'ENOENT'
 */
export function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

  return typeof code === 'string' ? code : 'UNKNOWN';
}
