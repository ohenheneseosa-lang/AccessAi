import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { AssistRequestSchema, demoAssist, type AssistResponse } from '@accessai/shared';
import { claudeAssist, hasClaudeCredentials } from './claude.js';

export interface AppOptions {
  /** 'claude' calls the Claude API; 'demo' uses the on-device demo brain. */
  brain?: 'claude' | 'demo';
  assist?: typeof claudeAssist;
  logger?: boolean;
}

const ReportSchema = z.object({
  url: z.string().max(2000),
  barrier: z.enum(['unlabelled-image', 'no-captions', 'low-contrast', 'keyboard-trap', 'unlabelled-button', 'other']),
  details: z.string().max(2000).default(''),
});

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const brain = opts.brain ?? (process.env.ACCESSAI_BRAIN === 'demo' || !hasClaudeCredentials() ? 'demo' : 'claude');
  const assist = opts.assist ?? claudeAssist;
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: 8 * 1024 * 1024,
  });
  const reports: z.infer<typeof ReportSchema>[] = [];

  // CORS: only the browser extension may call this API.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && /^(chrome|moz|safari-web)-extension:\/\//.test(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-headers', 'content-type');
      reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
      reply.header('vary', 'origin');
    }
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  app.get('/health', async () => ({ ok: true, brain }));

  app.post('/v1/assist', async (req, reply) => {
    const parsed = AssistRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues.length });
    let result: AssistResponse;
    if (brain === 'demo') {
      result = demoAssist(parsed.data);
    } else {
      try {
        result = await assist(parsed.data);
      } catch (err) {
        req.log.error({ err: (err as Error).message }, 'assist failed');
        return reply.code(502).send({ error: 'ai_unavailable' });
      }
    }
    return result;
  });

  // "Report this site": a structured barrier report. No page content is stored.
  app.post('/v1/reports', async (req, reply) => {
    const parsed = ReportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const { url, ...rest } = parsed.data;
    let origin = 'invalid';
    try {
      origin = new URL(url).origin;
    } catch {}
    reports.push({ url: origin, ...rest });
    return reply.code(201).send({ ok: true, received: reports.length });
  });

  return app;
}
