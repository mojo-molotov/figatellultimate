/**
 * The property tests' randomness, made reproducible: one seed for every `fc.assert`, so a run on CI and a run on a
 * laptop draw the same inputs, and a failure replays as is.
 *
 * Key design decisions:
 *     - A fixed seed by default: the project's tests never depend on luck. `FC_SEED=<n> pnpm test` explores another
 *       draw; a counterexample it finds becomes an `examples` entry of its property.
 *     - Properties replace hand-picked cases where an invariant holds for a whole space (a total URL reading, a
 *       round trip, a parser answering any path); the cases stay as `examples`, checked first.
 */
import * as fc from 'fast-check';

fc.configureGlobal({ seed: Number(process.env['FC_SEED'] ?? 20_261_117) });
