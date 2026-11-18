/**
 * The paginations' icons of previous and next: arrows, shown alone on a narrow screen (`@figatellu/ui`'s stylesheet),
 * their labels kept as the links' names. One set for the listings and the folder pages.
 */
import type { PaginationIcons } from '@figatellu/facets-react';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

export const PAGINATION_ICONS = {
  previous: <ArrowLeftIcon />,
  next: <ArrowRightIcon />,
} as const satisfies PaginationIcons;
