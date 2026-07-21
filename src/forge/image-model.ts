import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { ImageModel } from 'ai';
import { env } from '../env';

export type ImageProvider = 'google' | 'openai';

// Sensible defaults when FORGE_IMAGE_MODEL is unset. Imagen 4 is flat-rate per image
// (cheaper/predictable) and already in Forge's dependency set; swap the id for
// imagen-4.0-fast-generate-001 (drafts) or a gpt-image-* id when using OpenAI.
const DEFAULT_IMAGE_MODEL: Record<ImageProvider, string> = {
  google: 'imagen-4.0-generate-001',
  openai: 'gpt-image-1.5',
};

export function resolveImageProvider(): ImageProvider {
  const raw = (env.FORGE_IMAGE_PROVIDER ?? 'google').toLowerCase();
  if (raw !== 'google' && raw !== 'openai') {
    throw new Error(`FORGE_IMAGE_PROVIDER must be "google" or "openai"; got "${raw}".`);
  }
  return raw;
}

// True only when the selected provider's API key is present, so the generation path
// can fail closed with a clear message instead of throwing mid-request.
export function isImageGenerationConfigured(): boolean {
  const raw = (env.FORGE_IMAGE_PROVIDER ?? 'google').toLowerCase();
  if (raw === 'google') return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (raw === 'openai') return Boolean(env.OPENAI_API_KEY);
  return false;
}

export function resolveImageModel(): ImageModel {
  const provider = resolveImageProvider();
  const model = env.FORGE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL[provider];
  return provider === 'google' ? google.image(model) : openai.image(model);
}
