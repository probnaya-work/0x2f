import { createStore } from './core/store.mjs';
import { createProviderRegistry } from './providers/index.mjs';
import { runEngineeringTask } from './core/engineering.mjs';
const [, , base, slug, , token] = process.argv;
const abort = new AbortController();
process.on('SIGTERM', () => abort.abort());
await runEngineeringTask({ store: createStore(base), slug, token, providers: createProviderRegistry({ base }), signal: abort.signal });
