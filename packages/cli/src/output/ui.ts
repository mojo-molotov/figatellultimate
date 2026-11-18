/**
 * The terminal UI: `@clack/prompts` in a terminal, plain lines otherwise; colors through `util.styleText`, which
 * honors `NO_COLOR`.
 */
import type { Writable } from 'node:stream';
import { styleText } from 'node:util';

import { intro, log, note, outro, spinner } from '@clack/prompts';

import { PLAIN, type Styler } from './report.js';

/** What the commands print with; a polished terminal UI or plain lines. */
export interface Ui {
  readonly style: Styler;
  intro(title: string): void;
  /** A phase: a spinner in a terminal, a line in plain output. */
  phase(message: string): { done(message: string): void; failed(message: string): void };
  block(title: string, lines: readonly string[]): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  outro(message: string): void;
}

const COLORS: Styler = {
  bold: (t) => styleText('bold', t),
  dim: (t) => styleText('dim', t),
  red: (t) => styleText('red', t),
  yellow: (t) => styleText('yellow', t),
  cyan: (t) => styleText('cyan', t),
  green: (t) => styleText('green', t),
};

/**
 * `@clack/prompts` in a terminal: intro, spinners, notes, outro.
 *
 * @param output - Where to print.
 * @returns A UI with an intro, spinners, notes and an outro.
 */
export function createFancyUi(output: Writable): Ui {
  return {
    style: COLORS,
    intro: (title) => {
      intro(styleText(['bgCyan', 'black'], ` ${title} `), { output });
    },
    phase: (message) => {
      const s = spinner({ output });

      s.start(message);

      return {
        done: (m) => {
          s.stop(m);
        },
        failed: (m) => {
          s.error(m);
        },
      };
    },
    block: (title, lines) => {
      note(lines.join('\n'), title, { output, format: (line) => line });
    },
    info: (message) => {
      log.info(message, { output });
    },
    warn: (message) => {
      log.warn(message, { output });
    },
    error: (message) => {
      log.error(message, { output });
    },
    outro: (message) => {
      outro(message, { output });
    },
  };
}

/**
 * Plain lines without colors or animations: CI, pipes, `NO_COLOR`, tests.
 *
 * @param output - Where to print.
 * @returns A UI of plain lines.
 */
export function createPlainUi(output: Writable): Ui {
  const write = (line: string): void => {
    output.write(`${line}\n`);
  };

  return {
    style: PLAIN,
    intro: (title) => {
      write(title);
    },
    phase: () => ({
      done: (m) => {
        write(`✓ ${m}`);
      },
      failed: (m) => {
        write(`✖ ${m}`);
      },
    }),
    block: (title, lines) => {
      write('');
      write(title);

      for (const line of lines) write(`  ${line}`);

      write('');
    },
    info: (m) => {
      write(m);
    },
    warn: (m) => {
      write(`▲ ${m}`);
    },
    error: (m) => {
      write(`✖ ${m}`);
    },
    outro: (m) => {
      write(m);
    },
  };
}
