import type { z } from 'zod';
import type { LanguageModel } from 'ai';

export interface BrandVoice {
  tone: string[];
  about: string;
  audience: string;
  dos: string[];
  donts: string[];
  samplePosts: string[];
  bannedPhrases: string[];
}

export interface ClientContext {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  website: string | null;
  locations: number;
  brandVoice: BrandVoice;
}

// Injected into every tool by the runtime. `model` is the configured provider's model,
// so tools that call the LLM stay provider-agnostic too.
export interface ToolContext {
  client: ClientContext;
  model: LanguageModel;
}

// The contract every Forge capability implements. Provider-independent on purpose.
export interface ForgeTool<TInput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  execute: (input: TInput, ctx: ToolContext) => Promise<unknown>;
}

export type AnyForgeTool = ForgeTool<any>;
