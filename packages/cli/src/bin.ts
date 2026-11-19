#!/usr/bin/env node
/**
 * The `figatellultimate` binary: runs `main` with the process's arguments and sets its exit code.
 */
import { main } from './main.js';

process.exitCode = await main(process.argv.slice(2));
