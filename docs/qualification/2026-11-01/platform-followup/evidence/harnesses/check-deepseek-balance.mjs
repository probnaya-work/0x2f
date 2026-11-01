// Read-only official balance endpoint; no model request or secret output.
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire('/Users/bogart/.n/lib/node_modules/@deepseek-ai/dsh/package.json');
const config = require('yaml').parse(fs.readFileSync('/Users/bogart/.dsh/.credentials.yaml', 'utf8'));
let key = config.refs?.DEEPSEEK_API_KEY;
if (typeof key !== 'string' || !key) throw new Error('Existing DSH credential unavailable');
const response = await fetch('https://api.deepseek.com/user/balance', { headers: { authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
key = undefined;
const body = await response.json();
const safe = { at: new Date().toISOString(), endpoint: 'GET https://api.deepseek.com/user/balance', status: response.status,
  isAvailable: body.is_available === true, balances: (body.balance_infos ?? []).map(row => ({ currency: row.currency, total: row.total_balance, granted: row.granted_balance, toppedUp: row.topped_up_balance })), modelRequests: 0 };
fs.writeFileSync(new URL('./live-approved-20261101/deepseek-balance-before.json', import.meta.url), JSON.stringify(safe, null, 2) + '\n');
console.log(JSON.stringify(safe));
