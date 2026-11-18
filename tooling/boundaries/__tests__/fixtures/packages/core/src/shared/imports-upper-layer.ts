// Negative fixture: a lower layer (shared) must not import an upper one (content).
import { contentHelper } from '../content/imports-lower-layer.js';

export function sharedHelper(): string {
  return contentHelper();
}
