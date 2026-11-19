/**
 * Testing Library's waits, made generous for every test: `waitFor` and `findBy…` give up after `ASYNC_TIMEOUT`
 * instead of one second (`timeouts.ts` says why). Set in the scenario and browser configurations.
 */
import { configure } from '@testing-library/dom';

import { ASYNC_TIMEOUT } from './timeouts.ts';

configure({ asyncUtilTimeout: ASYNC_TIMEOUT });
