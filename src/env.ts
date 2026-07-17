import 'dotenv/config';
import { z } from 'zod';

const providerSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;

  const normalized = value.trim();
  const quote = normalized.at(0);
  if ((quote === '"' || quote === "'") && normalized.at(-1) === quote) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}, z.enum(['anthropic', 'openai', 'google', 'openai-compatible']));

const schema = z.object({
  // Supabase — always required.
  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // Which model provider to use.
  FORGE_PROVIDER: providerSchema.default('anthropic'),
  FORGE_MODEL: z.string().optional(), // defaults per-provider if unset
  FORGE_BASE_URL: z.string().optional(), // for openai-compatible / local (e.g. Ollama)
  FORGE_API_KEY: z.string().optional(), // optional key for openai-compatible endpoints

  // Scheduled jobs (Inngest). Cron strings; sensible defaults applied if unset.
  FORGE_CONTENT_CRON: z.string().optional(),
  FORGE_REVIEW_CRON: z.string().optional(),

  // Provider API keys — only the one matching FORGE_PROVIDER is needed.
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
});

// Keep these references explicit so Next.js includes each server-only variable in
// the Vercel function bundle instead of relying on dynamic process.env access.
const runtimeEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FORGE_PROVIDER: process.env.FORGE_PROVIDER,
  FORGE_MODEL: process.env.FORGE_MODEL,
  FORGE_BASE_URL: process.env.FORGE_BASE_URL,
  FORGE_API_KEY: process.env.FORGE_API_KEY,
  FORGE_CONTENT_CRON: process.env.FORGE_CONTENT_CRON,
  FORGE_REVIEW_CRON: process.env.FORGE_REVIEW_CRON,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};

const parsed = schema.safeParse(runtimeEnv);
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  console.error(
    `\nForge is missing required configuration: ${missing}\n\n` +
      `Copy .env.example to .env and fill it in (Supabase URL + service-role key, ` +
      `plus the API key for your FORGE_PROVIDER):\n` +
      `  cp .env.example .env\n`,
  );
  process.exit(1);
}

export const env = parsed.data;
