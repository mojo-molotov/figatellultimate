import { adapt } from '@figatellu/fake-adapter';

export function useAdapter(): string {
  return adapt();
}
