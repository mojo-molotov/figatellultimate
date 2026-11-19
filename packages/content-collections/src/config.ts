/**
 * The entry of the user's Content Collections config (`@figatellultimate/content-collections/config`): `withFigatellultimate` and
 * `rehypeHeadings`. Import-light on purpose: the user's config loads neither the builder nor figatellultimate's core.
 *
 * Key design decision: Content Collections bundles and imports the user's config as a separate module instance, so
 * `withFigatellultimate` and the adapter only meet on `globalThis`, under a registered symbol only this module writes.
 */
// `@figatellultimate/content-collections/config`: what the user's Content Collections config imports. Kept free of any
// import, so the config loads neither the builder nor @figatellultimate/core, whatever the loader or bundler.

/**
 * State shared between the adapter and the user's Content Collections config. The config is bundled and imported
 * by Content Collections as a separate module instance, so `withFigatellultimate` and the adapter only meet on `globalThis`.
 */
export interface Session {
  readonly directories: Map<string, string>;
  readonly documents: Map<string, readonly unknown[]>;
}
interface Channel {
  session: Session | null;
  /** Builds are serialized: a session belongs to one build at a time. */
  queue: Promise<unknown>;
}

const CHANNEL = Symbol.for('figatellultimate.content-collections');

/** Only this module writes the channel, under a registered symbol: a value with its shape is ours. */
const isChannel = (value: unknown): value is Channel =>
  typeof value === 'object' &&
  value !== null &&
  'session' in value &&
  'queue' in value &&
  value.queue instanceof Promise;

function channel(): Channel {
  const existing: unknown = Reflect.get(globalThis, CHANNEL);

  if (isChannel(existing)) return existing;

  const created: Channel = { session: null, queue: Promise.resolve() };

  Reflect.set(globalThis, CHANNEL, created);

  return created;
}

/**
 * Runs a build's task with a fresh session, after any build already running in this process.
 *
 * @param task - The build, given the session that collects its directories and documents.
 * @returns The task's result.
 *
 * @example
 * const documents = await exclusive(async (session) => { await builder.build(); return session.documents; });
 */
export function exclusive<T>(task: (session: Session) => Promise<T>): Promise<T> {
  const shared = channel();
  const run = shared.queue.then(async () => {
    const session: Session = { directories: new Map(), documents: new Map() };

    shared.session = session;

    try {
      return await task(session);
    } finally {
      shared.session = null;
    }
  });

  shared.queue = run.catch(() => undefined);

  return run;
}

interface WrappableCollection {
  readonly name: string;
  readonly directory: string;
  readonly onSuccess?: ((documents: never[]) => unknown) | undefined;
}

/**
 * Wraps a Content Collections collection, so that the adapter receives its directory and documents.
 *
 * @param collection - A collection from Content Collections' `defineCollection`.
 * @returns The same collection, whose transform also hands each document to the running adapter build; outside an
 *   adapter build, it changes nothing.
 *
 * @example
 * // content-collections.ts
 * const blog = withFigatellultimate(defineCollection({ name: 'blog', directory: 'content/blog', include: '**' + '/*.mdx', schema }));
 * export default defineConfig({ content: [blog] });
 */
export function withFigatellultimate<C extends WrappableCollection>(collection: C): C {
  channel().session?.directories.set(collection.name, collection.directory);
  const userOnSuccess = collection.onSuccess;

  // Same collection with a chained `onSuccess`: Content Collections only calls it with this collection's documents.
  return {
    ...collection,
    onSuccess: async (documents: never[]) => {
      channel().session?.documents.set(collection.name, documents);
      await userOnSuccess?.(documents);
    },
  };
}

export { rehypeHeadings, type HastNode } from './headings.js';
