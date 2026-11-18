import { a } from './cycle-a.js';

export function b(): string {
  return typeof a === 'function' ? 'b' : '';
}
