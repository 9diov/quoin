/**
 * @quoin-terms Integration, Validation Result, Parse Result
 * @quoin-docs docs/design/D5-node-cli-integration.md
 */

import type { OutputFormat } from '../node-lib/config.js';

const ENABLED = Symbol('outputEnabled');

type OutputState = {
  format: OutputFormat;
  [ENABLED]: boolean;
};

const state: OutputState = { format: 'human', [ENABLED]: true };

export function setOutputFormat(format: OutputFormat): void {
  state.format = format;
}

export function disableOutput(): void {
  state[ENABLED] = false;
}

export function getOutputFormat(): OutputFormat {
  return state.format;
}

export function printHuman(message: string): void {
  if (state.format === 'human' && state[ENABLED]) {
    process.stdout.write(`${message}\n`);
  }
}

export function printJson(data: unknown): void {
  if (state.format === 'json' && state[ENABLED]) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  }
}

export function printError(message: string): void {
  if (state.format === 'human') {
    process.stderr.write(`${message}\n`);
  } else {
    process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  }
}
