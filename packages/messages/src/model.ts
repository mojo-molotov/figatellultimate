/**
 * What the code generator reads of the analyzed messages: the reference's exact shape and argument types, the
 * content-required tree, and each locale's file.
 */
import type { MessageTree } from '@figatellu/core';

/** The type of an ICU argument, as the generated types expose it. */
export type ArgumentType =
  /** A plain `{name}`: any text or number. */
  | { readonly kind: 'text' }
  /** `number`, `plural` and `selectordinal`. */
  | { readonly kind: 'number' }
  /** `date` and `time`. */
  | { readonly kind: 'date' }
  /** `select`: its options other than `other` (any other text is accepted when `other` exists). */
  | { readonly kind: 'select'; readonly options: readonly string[]; readonly open: boolean };

/** A level of the reference: a group of keys, or a message with its arguments. */
export type ShapeNode =
  | { readonly kind: 'group'; readonly children: Readonly<Record<string, ShapeNode>> }
  | { readonly kind: 'message'; readonly args: Readonly<Record<string, ArgumentType>> };

/** What the codegen needs: the reference's exact shape, the content-required part, the module of each locale. */
export interface MessagesModel {
  /** The default locale's keys and arguments; the required tree alone when its module is unusable. */
  readonly reference: Extract<ShapeNode, { kind: 'group' }>;
  readonly tree: MessageTree;
  /** Message module of each declared locale, relative to the messages folder. */
  readonly files: Readonly<Record<string, string>>;
}
