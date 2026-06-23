import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  // Supabase — always required.
  SUPABASE_URL: z.string().min(1, 'SUPABASE_URL is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // Which model provider to use.
  FORGE_PROVIDER: z.enum(['anthropic', 'openai', 'google', 'openai-compatible']).default('anthropic'),
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

export const env = schema.parse(process.env);
