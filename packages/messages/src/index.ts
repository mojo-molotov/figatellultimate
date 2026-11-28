// prettier-ignore
/**
 * `@figatellultimate/messages`: the analysis of the message modules, as diagnostics and a model for the code generator.
 *
 *     analyzeMessages ──> every locale against the content's keys and the default locale's (`analyze.ts`)
 *     checkNavigationLabels ──> the navigation's labels against the messages (`navigation.ts`)
 *     findUnusedMessages ──> the app's messages no code uses, given the used keys (`unused.ts`)
 *
 * Pure: the CLI loads the modules and prints the diagnostics; nothing here reads a file or prints.
 */
export { analyzeMessages } from './analyze.js';
export { checkNavigationLabels } from './navigation.js';
export { findUnusedMessages, referenceKeys } from './unused.js';
export type * from './diagnostics.js';
export type { ArgumentType, MessagesModel, ShapeNode } from './model.js';
