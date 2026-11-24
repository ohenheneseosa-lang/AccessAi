import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { ActionStepSchema, redactSensitive, type AssistRequest, type AssistResponse } from '@accessai/shared';
import { SYSTEM_PROMPT } from './prompts.js';

/** What the model returns (validated before anything acts on it). */
const ModelOutput = z.object({
  label: z.string().nullable(),
  text: z.string(),
  sources: z.array(z.string()),
  plan: z.object({ goal: z.string(), steps: z.array(ActionStepSchema) }).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  aiDescription: z.boolean(),
});

export interface ClaudeConfig {
  /** Agent reasoning, Q&A and image description. */
  reasoningModel: string;
  /** Fast summaries and plain-English rewrites. */
  fastModel: string;
}

export const DEFAULT_MODELS: ClaudeConfig = {
  reasoningModel: process.env.ACCESSAI_REASONING_MODEL ?? 'claude-sonnet-5-5',
  fastModel: process.env.ACCESSAI_FAST_MODEL ?? 'claude-haiku-5-5',
};

export function hasClaudeCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export async function claudeAssist(req: AssistRequest, cfg: ClaudeConfig = DEFAULT_MODELS): Promise<AssistResponse> {
  const fast = req.mode === 'summarise' || req.mode === 'plain_english' || req.mode === 'transcript_summary';
  const model = fast ? cfg.fastModel : cfg.reasoningModel;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.mode === 'describe_images') {
    for (const img of req.images ?? []) {
      const m = img.dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
      if (!m) continue;
      content.push({ type: 'text', text: `Image ref ${img.ref}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png', data: m[2]! } });
    }
  }
  content.push({ type: 'text', text: renderRequest(req) });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.slice(-10).map((t) => ({ role: t.role, content: redactSensitive(t.text) }) as Anthropic.Beta.BetaMessageParam),
    { role: 'user', content },
  ];

  const isSonnet55 = model === 'claude-sonnet-5-5';
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { effort: 'low', format: betaZodOutputFormat(ModelOutput) },
    // Server-side refusal fallback (routes by category); Haiku has none.
    ...(isSonnet55 ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });

  if (response.stop_reason === 'refusal') {
    return {
      label: null,
      text: "I can't help with that one. You can ask me something else about this page.",
      sources: [],
      plan: null,
      confidence: 'high',
      aiDescription: false,
      answeredBy: model,
    };
  }
  const out = response.parsed_output;
  if (!out) throw new Error(`Model returned no parseable output (stop_reason=${response.stop_reason})`);
  return { ...out, plan: sanitisePlan(out.plan, req), answeredBy: response.model ?? model };
}

/** Drop any step that targets an unknown, sensitive or commit element. */
export function sanitisePlan(plan: z.infer<typeof ModelOutput>['plan'], req: AssistRequest) {
  if (!plan) return null;
  const byRef = new Map(req.snapshot?.interactive.map((i) => [i.ref, i]) ?? []);
  const steps = plan.steps.filter((s) => {
    const el = byRef.get(s.ref);
    return el && !el.sensitive && !(el.commit && s.op === 'click');
  });
  return steps.length ? { goal: plan.goal, steps } : null;
}

function renderRequest(req: AssistRequest): string {
  const parts = [`<mode>${req.mode}</mode>`, `<reading_level>${req.readingLevel}</reading_level>`];
  if (req.snapshot) {
    const s = req.snapshot;
    const interactive = s.interactive
      .slice(0, 150)
      .map((i) =>
        [
          `ref=${i.ref}`,
          `role=${i.role}`,
          `name="${i.name}"`,
          i.value ? `value="${i.value}"` : '',
          i.options ? `options=${JSON.stringify(i.options.slice(0, 30))}` : '',
          i.disabled ? 'disabled' : '',
          i.sensitive ? 'SENSITIVE' : '',
          i.commit ? 'COMMIT' : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join('\n');
    parts.push(
      `<page_snapshot>
<url>${s.url}</url>
<title>${s.title}</title>
<headings>
${s.headings.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join('\n')}
</headings>
<interactive>
${interactive}
</interactive>
<images>
${s.images.map((i) => `ref=${i.ref} alt="${i.alt}"${i.hasUsefulAlt ? '' : ' (no useful description)'}${i.caption ? ` caption="${i.caption}"` : ''}`).join('\n')}
</images>
<text>
${redactSensitive(s.text).slice(0, 60_000)}
</text>
</page_snapshot>`,
    );
  }
  if (req.transcript) parts.push(`<transcript>\n${redactSensitive(req.transcript)}\n</transcript>`);
  parts.push(`<request>${redactSensitive(req.message)}</request>`);
  return parts.join('\n');
}
