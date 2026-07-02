import type { LanguageModel } from 'ai';
import { buildModel, type ForgeProvider } from './resolve-model';

// Web-app model resolver. Unlike model.ts it does NOT import ../env, whose zod schema
// requires Supabase and hard-exits when it is missing. The demo web app needs only a
// model provider key, so it reads process.env directly and stays Supabase-free.

const PROVIDERS: ForgeProvider[] = ['anthropic', 'openai', 'google', 'openai-compatible'];

function currentProvider(): ForgeProvider {
  const raw = process.env.FORGE_PROVIDER ?? 'anthropic';
  return (PROVIDERS as string[]).includes(raw) ? (raw as ForgeProvider) : 'anthropic';
}

// The env var the active provider needs before it can make a call.
const KEY_ENV: Record<ForgeProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  'openai-compatible': 'FORGE_BASE_URL',
};

// True when the server is configured enough to serve a live demo. Used to render a
// friendly "not configured" state instead of throwing a raw provider error at the user.
export function isModelConfigured(): boolean {
  return Boolean(process.env[KEY_ENV[currentProvider()]]);
}

export function missingConfigMessage(): string {
  const provider = currentProvider();
  return `Set ${KEY_ENV[provider]} in the environment to enable the live demo (FORGE_PROVIDER=${provider}).`;
}

export function resolveWebModel(): LanguageModel {
  return buildModel({
    provider: currentProvider(),
    model: process.env.FORGE_MODEL,
    baseUrl: process.env.FORGE_BASE_URL,
    apiKey: process.env.FORGE_API_KEY,
  });
}
