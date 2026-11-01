// Exact installed user selection. Provider may serve its documented current
// Flash revision behind this accepted legacy alias; we never substitute it.
export const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const RESPONSE_MODELS = new Set(['deepseek-v4-flash', 'deepseek-flash', 'DeepSeek-V4.1-Flash-1017', 'deepseek-v4.1-flash-1017']);
const ALLOWED = new Set(['model', 'messages', 'stream', 'stream_options', 'max_tokens', 'thinking', 'reasoning_effort', 'tools', 'tool_choice', 'temperature', 'top_p']);
export function prepareDeepseekRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !ALLOWED.has(k))) throw new Error('Unexpected DeepSeek request field');
  if (body.model !== DEEPSEEK_MODEL || body.stream !== true) throw new Error('Exact configured model and SSE required');
  if (body.thinking?.type !== 'enabled' || body.reasoning_effort !== 'high') throw new Error('Configured high reasoning must be preserved');
  if (!Array.isArray(body.messages) || !body.messages.length) throw new Error('Messages required');
  const messages = body.messages.map(message => {
    if (!message || Object.keys(message).some(k => !['role', 'content', 'reasoning_content', 'name'].includes(k)) ||
        !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' ||
        (message.reasoning_content !== undefined && typeof message.reasoning_content !== 'string') ||
        (message.name !== undefined && typeof message.name !== 'string')) throw new Error('Plaintext messages only; no files, assets or tool history');
    return { role: message.role, content: message.content };
  });
  // No tools field crosses the upstream boundary: search/fetch is paid from
  // Nov 1 and all local tool calls are outside this approved text-only turn.
  return { model: DEEPSEEK_MODEL, messages, stream: true, stream_options: { include_usage: true },
    max_tokens: 1024, thinking: { type: 'enabled' }, reasoning_effort: 'high', tool_choice: 'none' };
}
export function inspectDeepseekSse(text) {
  const lines = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
  if (!lines.length || lines.at(-1) !== '[DONE]') throw new Error('Complete DeepSeek SSE required');
  let rawUsage; let responseModel; let finish; let content = '';
  for (const line of lines) {
    if (line === '[DONE]') continue;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error('Upstream SSE error');
    if (chunk.model) { if (typeof chunk.model !== 'string') throw new Error('Bad response model'); responseModel = chunk.model; }
    if ((chunk.choices?.length ?? 0) > 1) throw new Error('Multiple candidates refused');
    for (const choice of chunk.choices ?? []) {
      if (choice.index !== 0) throw new Error('Unexpected choice index');
      const delta = choice.delta ?? {};
      if (Object.keys(delta).some(k => !['role', 'content', 'reasoning_content'].includes(k)) ||
          (delta.content != null && typeof delta.content !== 'string') ||
          (delta.reasoning_content != null && typeof delta.reasoning_content !== 'string')) throw new Error('Unapproved tool or non-text output');
      content += delta.content ?? '';
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (chunk.usage) rawUsage = chunk.usage;
  }
  if (finish !== 'stop' || !content.trim()) throw new Error('Non-complete DeepSeek output; no automatic continuation');
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) if (!Number.isSafeInteger(rawUsage?.[key]) || rawUsage[key] < 0) throw new Error('Missing DeepSeek usage');
  if (rawUsage.completion_tokens > 1024 || rawUsage.total_tokens < rawUsage.prompt_tokens + rawUsage.completion_tokens) throw new Error('Combined reasoning/output cap violation');
  const reasoning = rawUsage.completion_tokens_details?.reasoning_tokens ?? 0;
  if (!Number.isSafeInteger(reasoning) || reasoning < 0 || reasoning > rawUsage.completion_tokens) throw new Error('Bad reasoning usage');
  return { functionCalls: 0, responseModel, policyError: RESPONSE_MODELS.has(responseModel) ? null : `Unapproved response model: ${responseModel ?? 'missing'}`, usage: { promptTokenCount: rawUsage.prompt_tokens,
    candidatesTokenCount: rawUsage.completion_tokens, thoughtsTokenCount: 0, totalTokenCount: rawUsage.total_tokens,
    deepseek: { prompt_tokens: rawUsage.prompt_tokens, completion_tokens: rawUsage.completion_tokens, reasoning_tokens: reasoning,
      prompt_cache_hit_tokens: rawUsage.prompt_cache_hit_tokens ?? 0, prompt_cache_miss_tokens: rawUsage.prompt_cache_miss_tokens ?? rawUsage.prompt_tokens } } };
}
