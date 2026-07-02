import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export type ForgeProvider = 'anthropic' | 'openai' | 'google' | 'openai-compatible';

// Sensible defaults per provider when no model is specified.
export const DEFAULT_MODEL: Record<ForgeProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
  'openai-compatible': 'llama3.1',
};

export interface ModelConfig {
  provider: ForgeProvider;
  model?: string;
  baseUrl?: string; // for openai-compatible / local
  apiKey?: string; // optional key for openai-compatible endpoints
}

// Pure provider → LanguageModel mapping with no env or Supabase coupling, so both the
// CLI runtime (via env) and the web app (via process.env) can share one code path.
// Adding a provider = add a case here (and its dependency).
export function buildModel(cfg: ModelConfig): LanguageModel {
  const model = cfg.model ?? DEFAULT_MODEL[cfg.provider];

  switch (cfg.provider) {
    case 'anthropic':
      return anthropic(model);
    case 'openai':
      return openai(model);
    case 'google':
      return google(model);
    case 'openai-compatible': {
      // Any OpenAI-compatible server: Ollama, LM Studio, vLLM, LiteLLM — run Forge offline.
      if (!cfg.baseUrl) {
        throw new Error(
          'FORGE_BASE_URL is required for FORGE_PROVIDER=openai-compatible (e.g. http://localhost:11434/v1 for Ollama).',
        );
      }
      const local = createOpenAICompatible({
        name: 'forge-local',
        baseURL: cfg.baseUrl,
        apiKey: cfg.apiKey ?? 'local',
      });
      return local(model);
    }
    default:
      throw new Error(`Unknown FORGE_PROVIDER "${cfg.provider as string}".`);
  }
}
