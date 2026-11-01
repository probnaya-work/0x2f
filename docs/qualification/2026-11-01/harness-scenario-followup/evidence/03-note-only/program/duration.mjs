#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export function formatDuration(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError('Seconds must be a non-negative safe integer.');
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  // The final assertion requires the actual end of input, including no newline.
  const canonicalInteger = /^(?:0|[1-9][0-9]*)(?![\s\S])/;
  if (args.length !== 1 || !canonicalInteger.test(args[0]) || !Number.isSafeInteger(Number(args[0]))) {
    console.error('Usage: duration.mjs <seconds> (a non-negative safe integer in canonical decimal form)');
    process.exitCode = 1;
  } else {
    console.log(formatDuration(Number(args[0])));
  }
}
