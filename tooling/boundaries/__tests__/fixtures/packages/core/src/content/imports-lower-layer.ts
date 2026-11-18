// Control fixture: an upper layer (content) may import a lower one (shared).
import { base } from '../shared/base.js';

export function contentHelper(): string {
  return base();
}
