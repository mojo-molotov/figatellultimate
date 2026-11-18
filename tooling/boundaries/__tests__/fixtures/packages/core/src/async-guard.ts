// A bug the lint must catch: `if (!isValidPair(...)) notFound()` with an async predicate is always false.
async function isValidPair(category: string, subcategory: string): Promise<boolean> {
  await Promise.resolve();
  return category.length > 0 && subcategory.length > 0;
}

export function guard(category: string, subcategory: string): void {
  if (!isValidPair(category, subcategory)) {
    throw new Error('not found');
  }
}
