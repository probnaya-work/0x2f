import { startGeminiBudgetGateway } from './gemini-budget-gateway.mjs';
export { DEEPSEEK_MODEL } from './deepseek-protocol.mjs';
export function startDeepseekBudgetGateway(options) {
  return startGeminiBudgetGateway({ ...options, provider: 'deepseek' });
}
