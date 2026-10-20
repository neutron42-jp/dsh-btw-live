/**
 * `/btw` — a side question answered outside the conversation history.
 *
 * The point of this plugin is the one thing the session-fork based side-question
 * plugins cannot do: it reads the live session log, so the turn that is running
 * right now (its tool calls, their results, its assistant text) is part of the
 * context. Nothing is written back to the model history, no tool runs on the
 * caller's behalf, and the running turn is never interrupted.
 *
 * @module @local/btw-live
 */

/** Plugin name used by loader diagnostics. */
export const name = 'btw-live';

/** The command registry and the model seam are the only services needed. */
export const inject = ['commands', 'llm'];

const DEFAULTS = {
  maxEvents: 80,
  maxChars: 16000,
  toolArgChars: 300,
  toolResultChars: 900,
  maxTokens: 4096,
  timeoutMs: 120000,
};

const SYSTEM = [
  'You are a one-shot side-question assistant for a DeepSeek Harness session.',
  'The transcript below is this session\'s live log. Lines marked ">>" belong to the turn that is running right now.',
  'Answer only the question that follows the transcript.',
  'Never continue the transcript\'s task, never propose or perform tool calls, never claim you changed anything.',
  'When the question asks about progress or current state, describe exactly what the transcript shows and say which parts are still in progress.',
  'Answer in the language of the question, concisely.',
].join(' ');

/**
 * Collect every text fragment of a content-block list.
 *
 * @param {unknown} content - A message content array.
 * @returns {string} The joined text.
 */
function blocksText(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block && typeof block === 'object' && typeof block.text === 'string' && block.text !== '') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

/**
 * Bound one rendered fragment.
 *
 * @param {string} value - Text to bound.
 * @param {number} limit - Maximum characters.
 * @returns {string} The bounded text.
 */
function clip(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

/**
 * Read the tool-call id of a result event across the shapes the log uses.
 *
 * @param {any} data - Event data.
 * @returns {string} The call id, or an empty string.
 */
function resultCallId(data) {
  return (
    data?.toolCallId ??
    data?.meta?.toolCallId ??
    data?.meta?.callId ??
    data?.message?.source?.callId ??
    ''
  );
}

/**
 * Render one session event as one transcript line, or null for noise.
 *
 * @param {{ type?: string, data?: any }} event - Session event.
 * @param {typeof DEFAULTS} limits - Rendering limits.
 * @param {Map<string, string>} [names] - Tool-call id to tool name.
 * @returns {string | null} The rendered line.
 */
function renderEvent(event, limits, names = new Map()) {
  const data = event?.data ?? {};
  switch (event?.type) {
    case 'user/message':
      return `[user] ${clip(blocksText(data.content), 2000)}`;
    case 'assistant/message':
      return `[assistant] ${clip(blocksText(data.message?.content), 2000)}`;
    case 'tool/call':
      return `[tool call] ${data.name}(${clip(data.arguments, limits.toolArgChars)})`;
    case 'tool/result': {
      const id = resultCallId(data);
      const label = names.get(id) ?? (id === '' ? 'unknown' : clip(id, 24));
      return `[tool result ${label}] ${clip(blocksText(data.message?.content), limits.toolResultChars)}`;
    }
    case 'todo/write':
      return `[todos] ${clip((data.todos ?? []).map((todo) => `${todo.status}:${todo.content}`).join(' | '), 700)}`;
    case 'job/registered':
      return `[job started] ${clip(data.jobId, 32)} ${clip(data.label, 200)}`;
    case 'job/settled':
      return `[job settled] ${clip(data.jobId, 32)} ${clip(JSON.stringify(data.status ?? data.outcome ?? ''), 120)}`;
    case 'working-directory/change':
      return `[cwd] ${clip(data.cwd, 200)}`;
    case 'turn/start':
      return `-- turn ${clip(data.turn, 12)} start`;
    case 'turn/end':
      return `-- turn ${clip(data.turn, 12)} end`;
    default:
      return null;
  }
}

/**
 * Build the transcript for one session, marking the still-running turn.
 *
 * @param {any} session - The agent's session handle.
 * @param {typeof DEFAULTS} limits - Rendering limits.
 * @returns {string} The transcript.
 */
function transcript(session, limits) {
  let events = [];
  try {
    if (typeof session?.snapshotEvents === 'function') events = session.snapshotEvents() ?? [];
  } catch {
    events = [];
  }
  if (!Array.isArray(events) || events.length === 0) return '(no session events yet)';

  const tail = events.slice(-limits.maxEvents);
  let lastTurnEnd = -1;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    if (tail[index]?.type === 'turn/end') {
      lastTurnEnd = index;
      break;
    }
  }

  const lines = [];
  const names = new Map();
  for (const event of tail) {
    if (event?.type === 'tool/call' && typeof event.data?.callId === 'string') names.set(event.data.callId, event.data.name ?? 'tool');
  }
  let used = 0;
  for (let index = 0; index < tail.length; index += 1) {
    const line = renderEvent(tail[index], limits, names);
    if (line === null) continue;
    const marked = index > lastTurnEnd ? `>> ${line}` : line;
    if (used + marked.length > limits.maxChars) break;
    used += marked.length;
    lines.push(marked);
  }
  return lines.join('\n') || '(nothing renderable yet)';
}

/**
 * Read the terminal outcome of a `finish` chunk across the protocol shapes.
 *
 * The current seam carries `{ reason: { kind, failure? } }`; the shape this
 * plugin originally read (`{ kind, failure? }`) is gone. Reading only the old
 * field reported every outcome as `unknown` and dropped the failure the
 * adapter had already classified, which is why an upstream rejection and an
 * empty answer looked identical.
 *
 * @param {{ reason?: any, kind?: any, failure?: any }} chunk - Finish chunk.
 * @returns {{ kind: string, failure?: any }} The reason and optional failure.
 */
function finishReason(chunk) {
  const reason = chunk?.reason;
  if (reason !== null && typeof reason === 'object' && typeof reason.kind === 'string') {
    return { kind: reason.kind, ...(reason.failure === undefined ? {} : { failure: reason.failure }) };
  }
  const kind = typeof chunk?.kind === 'string' ? chunk.kind : 'unknown';
  return { kind, ...(chunk?.failure === undefined ? {} : { failure: chunk.failure }) };
}

/**
 * Render a classified failure as one short clause.
 *
 * @param {{ code?: string, status?: number, message?: string }} [failure] - Adapter failure.
 * @returns {string} ` CODE HTTP 400 — message`, or an empty string.
 */
function describeFailure(failure) {
  if (failure === undefined) return '';
  const head = [failure.code, failure.status === undefined ? '' : `HTTP ${failure.status}`].filter(Boolean).join(' ');
  const tail = typeof failure.message === 'string' && failure.message !== '' ? ` — ${failure.message}` : '';
  return `${head === '' ? '' : ` ${head}`}${tail}`;
}

/**
 * Failure codes where a second attempt can plausibly differ from the first.
 * A rejected request (credential, quota, context overflow) fails the same way
 * twice, so the command reports it instead of spending another call.
 */
const RETRYABLE_CODES = new Set(['EMPTY_RESPONSE', 'PI_AI_ERROR', 'TIMEOUT', 'TRANSPORT']);

/**
 * Provider/model routes whose provider rejected the fast shape once. The next
 * side question for the same route goes straight to the profile's own shape.
 */
const effortRejected = new Set();

/**
 * Run one side question against the live session and return the answer text.
 *
 * @param {any} ctx - Plugin context.
 * @param {any} agent - The agent the command was invoked against.
 * @param {string} question - The raw question.
 * @param {typeof DEFAULTS} limits - Rendering and timeout limits.
 * @returns {Promise<string>} The answer text.
 */
async function answer(ctx, agent, question, limits) {
  const selection = ctx.get('agentDefaultModel')?.currentSelection?.() ?? {};
  const provider = selection.provider;
  const model = selection.model;
  if (typeof provider !== 'string' || typeof model !== 'string') {
    throw new Error('no provider/model selection is available for the side question');
  }

  const live = transcript(agent?.session, limits);
  const running = live.includes('\n>> ') || live.startsWith('>> ');
  const request = [
    'Session transcript (newest last).',
    running ? 'Lines marked ">>" are the turn running right now.' : 'No turn is running right now.',
    '',
    live,
    '',
    '---',
    `Question: ${question}`,
  ].join('\n');

  // A side question wants a fast answer, so ask the adapter for its lowest
  // reasoning effort when the model exposes a ladder. Failure to resolve the
  // model is not fatal: the request then runs with adapter defaults.
  let reasoningEffort;
  try {
    const info = await ctx.llm.resolveModelInfo?.(provider, model);
    const first = info?.reasoning?.efforts?.[0]?.id;
    if (typeof first === 'string') reasoningEffort = first;
  } catch {
    reasoningEffort = undefined;
  }

  /**
   * Consume one stream attempt and report everything it produced.
   *
   * @param {{ reasoningEffort?: string, maxTokens?: number }} plan - Per-attempt request plan.
   * @returns {Promise<{ text: string, reasoning: string, kind: string, failure?: any, counts: Record<string, number>, blockTypes: string[] }>} The attempt.
   */
  const consume = async (plan) => {
    let deltaText = '';
    let blockText = '';
    let deltaReasoning = '';
    let blockReasoning = '';
    let kind = 'none';
    let failure;
    const counts = {};
    const blockTypes = [];
    const call = {
      provider,
      model,
      system: SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: request }] }],
      maxTokens: plan.maxTokens,
    };
    if (plan.reasoningEffort !== undefined) call.reasoningEffort = plan.reasoningEffort;
    const stream = ctx.llm.stream({ ...call, signal: AbortSignal.timeout(limits.timeoutMs) });
    for await (const chunk of stream) {
      const type = String(chunk?.type ?? 'unknown');
      counts[type] = (counts[type] ?? 0) + 1;
      if (type === 'text-delta') deltaText += chunk.text ?? '';
      else if (type === 'reasoning-delta') deltaReasoning += chunk.text ?? '';
      else if (type === 'block-end') {
        const block = chunk.block ?? {};
        blockTypes.push(String(block.type ?? '?'));
        if (block.type === 'text') blockText += `${block.text ?? ''}\n`;
        else if (block.type === 'reasoning') blockReasoning += `${block.text ?? ''}\n`;
      } else if (type === 'finish') {
        const reason = finishReason(chunk);
        kind = reason.kind;
        failure = reason.failure;
      }
    }
    // Adapters that stream deltas also repeat the assembled block at
    // `block-end`, so block text is only a fallback for delta-less adapters.
    return {
      text: (deltaText !== '' ? deltaText : blockText).trim(),
      reasoning: (deltaReasoning !== '' ? deltaReasoning : blockReasoning).trim(),
      kind,
      ...(failure === undefined ? {} : { failure }),
      counts,
      blockTypes,
    };
  };

  /** Whether a finished-without-content attempt asks for a different second try. */
  const retryPlan = (result) => {
    if (result.kind === 'aborted') return undefined;
    const usable = result.text !== '' || result.reasoning !== '';
    if (usable) return undefined;
    if (result.failure !== undefined && !RETRYABLE_CODES.has(String(result.failure.code))) return undefined;
    // The fast shape (lowest effort, small budget) is a preference. A second
    // attempt drops both so it matches the request the session itself is
    // already making successfully, instead of repeating a rejected one.
    return {};
  };

  const route = `${provider}/${model}`;
  const attempts = [];
  const first = { maxTokens: limits.maxTokens };
  if (reasoningEffort !== undefined && !effortRejected.has(route)) first.reasoningEffort = reasoningEffort;
  let result = await consume(first);
  attempts.push(result);
  const plan = retryPlan(result);
  if (plan !== undefined) {
    result = await consume(plan);
    attempts.push(result);
    // Remember the route that refused the fast shape, so the next side
    // question skips a request the provider is known to reject. The answer
    // itself is unaffected: only the first attempt's shape changes.
    if (first.reasoningEffort !== undefined && (result.text !== '' || result.reasoning !== '')) effortRejected.add(route);
  }

  if (result.text !== '') return result.text;
  // A reasoning-only reply still answers what the user asked.
  if (result.reasoning !== '') return result.reasoning;

  const seen = attempts
    .map((attempt, index) => {
      const detail = Object.entries(attempt.counts).map(([key, value]) => `${key}=${value}`).join(' ');
      return `#${index + 1} ${attempt.kind}${describeFailure(attempt.failure)} [${detail}] blocks=[${attempt.blockTypes.join(',')}]`;
    })
    .join('; ');
  throw new Error(`no answer (${seen}; provider=${provider} model=${model})`);
}

/** Exported for tests: the transcript renderer takes a session handle and returns prompt text. */
export { renderEvent, transcript };

/**
 * Contribute the `btw` command.
 *
 * @param {any} ctx - Plugin context.
 * @param {{ [key: string]: unknown }} [config] - Row config.
 */
export function apply(ctx, config = {}) {
  const limits = { ...DEFAULTS, ...config };

  ctx.effect(() =>
    ctx.commands.register({
      name: 'btw',
      description: 'Ask a side question about this session, including the turn that is running now',
      input: { hint: '<question>' },
      handler: async ({ agent, rawInput }) => {
        const question = String(rawInput ?? '').trim();
        if (question === '') {
          return { kind: 'error', text: 'Usage: /btw <question>' };
        }
        try {
          return { kind: 'success', text: await answer(ctx, agent, question, limits) };
        } catch (error) {
          ctx.logger?.warn?.(`btw-live: ${String(error)}`);
          return { kind: 'error', text: `btw failed: ${error instanceof Error ? error.message : String(error)}` };
        }
      },
    }),
  );
}
