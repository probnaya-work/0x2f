#!/usr/bin/env node
// Candidate terminal entry. `new` authorizes exactly one bounded foreground
// attempt; the shared action still owns routing and all durable Task state.
import { main } from './cli.mjs';
main({foregroundCandidate:true}).catch(error=>{
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
});
