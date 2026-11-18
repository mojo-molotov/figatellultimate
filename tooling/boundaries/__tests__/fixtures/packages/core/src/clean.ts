// Control fixture: must produce no error at all, so that a rule set that reports everything cannot pass.
export function clean(value: string): string {
  return value.trim();
}
