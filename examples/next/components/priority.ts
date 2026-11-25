/**
 * How many previews each kind of page loads at once, in its order: the cards in view on arrival, whose images make
 * its largest contentful paint; every card after them loads lazily. Set per kind, from where its cards land on a
 * phone: a page whose cards start low (a section's text, an author's bio above them) shows fewer on arrival.
 */
export const PRIORITY_CARDS = {
  /** The blog's own page: its categories. */
  blog: 4,
  /** A category: its subcategories' sections, counted across them. */
  category: 4,
  /** A subcategory: its posts. */
  subcategory: 2,
  /** An author's page: their posts, under their bio. */
  author: 2,
  /** A section's page (`/docs`): its pages, subfolder headings aside. */
  section: 2,
} as const satisfies Readonly<Record<string, number>>;
