import type { LanguageModel } from 'ai';
import { env } from '../env';
import { buildModel } from './resolve-model';

// Resolve the configured provider + model into a single LanguageModel that the runtime
// and every tool share. The provider → model mapping lives in resolve-model.ts so the
// web app can reuse it without importing the (Supabase-strict) env module.
export function resolveModel(): LanguageModel {
  return buildModel({
    provider: env.FORGE_PROVIDER,
    model: env.FORGE_MODEL,
    baseUrl: env.FORGE_BASE_URL,
    apiKey: env.FORGE_API_KEY,
  });
}
