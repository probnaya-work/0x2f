#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function formatDuration(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new RangeError('Seconds must be a non-negative safe integer.');
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

// The final assertion requires the actual end of input, including no newline.
const canonicalInteger = /^(?:0|[1-9][0-9]*)(?![\s\S])/;

function parseSeconds(token) {
  if (!canonicalInteger.test(token)) {
    return null;
  }
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

function formatArgs(args) {
  if (args[0] === '--sum') {
    if (args.length < 2) {
      return null;
    }
    let total = 0n;
    for (const token of args.slice(1)) {
      const value = parseSeconds(token);
      if (value === null) {
        return null;
      }
      total += BigInt(value);
    }
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
    return formatDuration(Number(total));
  }

  if (args.length !== 1) {
    return null;
  }
  const value = parseSeconds(args[0]);
  return value === null ? null : formatDuration(value);
}

// argv[1] may be a non-canonical alias (for example /var/... on macOS), so
// compare real paths instead of URL strings.
function isEntryPoint() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const formatted = formatArgs(process.argv.slice(2));
  if (formatted === null) {
    console.error(
      'Usage: duration.mjs <seconds> | --sum <seconds>... ' +
        '(non-negative safe integers in canonical decimal form; sum must not exceed Number.MAX_SAFE_INTEGER)',
    );
    process.exitCode = 1;
  } else {
    console.log(formatted);
  }
}
