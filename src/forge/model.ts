import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { env } from '../env';

// Sensible defaults per provider when FORGE_MODEL is unset.
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
  'openai-compatible': 'llama3.1',
};

// Resolve the configured provider + model into a single LanguageModel that the runtime
// and every tool share. Adding a provider = add a case here (and one dependency).
export function resolveModel(): LanguageModel {
  const provider = env.FORGE_PROVIDER;
  const model = env.FORGE_MODEL ?? DEFAULT_MODEL[provider];

  switch (provider) {
    case 'anthropic':
      return anthropic(model);
    case 'openai':
      return openai(model);
    case 'google':
      return google(model);
    case 'openai-compatible': {
      // Any OpenAI-compatible server: Ollama, LM Studio, vLLM, LiteLLM — run Forge offline.
      if (!env.FORGE_BASE_URL) {
        throw new Error(
          'FORGE_BASE_URL is required for FORGE_PROVIDER=openai-compatible (e.g. http://localhost:11434/v1 for Ollama).',
        );
      }
      const local = createOpenAICompatible({
        name: 'forge-local',
        baseURL: env.FORGE_BASE_URL,
        apiKey: env.FORGE_API_KEY ?? 'local',
      });
      return local(model);
    }
    default:
      throw new Error(`Unknown FORGE_PROVIDER "${provider}".`);
  }
}
