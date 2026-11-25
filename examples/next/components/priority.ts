/**
 * How many previews a page loads at once, in its order: the cards in view on arrival, whose images make its largest
 * contentful paint; every card after them loads lazily. Every page showing cards gives them `priority` by it: the
 * blog's pages, a listing, an author's page, a section's page.
 */
export const PRIORITY_CARDS = 4;
