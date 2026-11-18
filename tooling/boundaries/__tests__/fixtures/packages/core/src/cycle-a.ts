import { b } from './cycle-b.js';

export function a(): string {
  return `a${b()}`;
}
