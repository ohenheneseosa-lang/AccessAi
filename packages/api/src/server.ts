import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const app = buildApp({ logger: true });
const { brain } = (await app.inject({ method: 'GET', url: '/health' })).json() as { brain: string };
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
app.log.info(`AccessAI API on :${port}, brain=${brain}`);
