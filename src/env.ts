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

const requiredConfigSchema = z.string().trim().min(1);
const optionalConfigSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized || undefined;
}, z.string().optional());

const schema = z.object({
  // Supabase — always required.
  SUPABASE_URL: requiredConfigSchema,
  SUPABASE_SERVICE_ROLE_KEY: requiredConfigSchema,

  // Which model provider to use.
  FORGE_PROVIDER: providerSchema.default('anthropic'),
  FORGE_MODEL: optionalConfigSchema, // defaults per-provider if unset
  FORGE_BASE_URL: optionalConfigSchema, // for openai-compatible / local (e.g. Ollama)
  FORGE_API_KEY: optionalConfigSchema, // optional key for openai-compatible endpoints

  // Scheduled jobs (Inngest). Cron strings; sensible defaults applied if unset.
  FORGE_CONTENT_CRON: optionalConfigSchema,
  FORGE_REVIEW_CRON: optionalConfigSchema,
  FORGE_PUBLISH_CRON: optionalConfigSchema,
  FORGE_METRICS_CRON: optionalConfigSchema,

  // Google Business Profile review ingestion. Server-only.
  GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN: optionalConfigSchema,
  GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN: optionalConfigSchema,
  GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID: optionalConfigSchema,
  GOOGLE_BUSINESS_PROFILE_LOCATION_ID: optionalConfigSchema,
  GOOGLE_OAUTH_CLIENT_ID: optionalConfigSchema,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalConfigSchema,

  // Meta (Facebook Page + Instagram) publishing. Server-only.
  META_PAGE_ID: optionalConfigSchema,
  META_PAGE_ACCESS_TOKEN: optionalConfigSchema,
  META_GRAPH_VERSION: optionalConfigSchema,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: optionalConfigSchema,

  // Image generation (post creatives). Server-only. Reuses the matching provider key
  // (GOOGLE_GENERATIVE_AI_API_KEY for google, OPENAI_API_KEY for openai).
  FORGE_IMAGE_PROVIDER: optionalConfigSchema, // 'google' (default) | 'openai'
  FORGE_IMAGE_MODEL: optionalConfigSchema, // defaults per provider if unset
  FORGE_IMAGE_BUCKET: optionalConfigSchema, // Supabase Storage bucket; default content-images

  // Billing (Stripe). Server-only, all optional. Unset → manual operator billing control.
  STRIPE_SECRET_KEY: optionalConfigSchema,
  STRIPE_WEBHOOK_SECRET: optionalConfigSchema,
  STRIPE_PRICE_STARTER: optionalConfigSchema, // Stripe Price id for the Starter plan
  STRIPE_PRICE_GROWTH: optionalConfigSchema, // Stripe Price id for the Growth plan

  // Review-request delivery. Server-only, all optional. Email via Resend, SMS via
  // Twilio. Unset providers fall back to manual send (operator copies the link).
  RESEND_API_KEY: optionalConfigSchema,
  FORGE_REVIEW_FROM_EMAIL: optionalConfigSchema, // verified Resend sender, e.g. reviews@yourdomain.com
  TWILIO_ACCOUNT_SID: optionalConfigSchema,
  TWILIO_AUTH_TOKEN: optionalConfigSchema,
  TWILIO_FROM_NUMBER: optionalConfigSchema, // E.164 sending number, e.g. +12055551234

  // DataForSEO keyword metrics. Server-only.
  DATAFORSEO_LOGIN: optionalConfigSchema,
  DATAFORSEO_PASSWORD: optionalConfigSchema,
  DATAFORSEO_LOCATION_CODE: optionalConfigSchema,
  DATAFORSEO_LOCATION_NAME: optionalConfigSchema,
  DATAFORSEO_LANGUAGE_CODE: optionalConfigSchema,
  DATAFORSEO_LANGUAGE_NAME: optionalConfigSchema,
  DATAFORSEO_INCLUDE_CLICKSTREAM: optionalConfigSchema,

  // Provider API keys — only the one matching FORGE_PROVIDER is needed.
  ANTHROPIC_API_KEY: optionalConfigSchema,
  OPENAI_API_KEY: optionalConfigSchema,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalConfigSchema,
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
  FORGE_PUBLISH_CRON: process.env.FORGE_PUBLISH_CRON,
  FORGE_METRICS_CRON: process.env.FORGE_METRICS_CRON,
  GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN: process.env.GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN,
  GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN: process.env.GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN,
  GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID: process.env.GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID,
  GOOGLE_BUSINESS_PROFILE_LOCATION_ID: process.env.GOOGLE_BUSINESS_PROFILE_LOCATION_ID,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  META_PAGE_ID: process.env.META_PAGE_ID,
  META_PAGE_ACCESS_TOKEN: process.env.META_PAGE_ACCESS_TOKEN,
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER,
  STRIPE_PRICE_GROWTH: process.env.STRIPE_PRICE_GROWTH,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FORGE_REVIEW_FROM_EMAIL: process.env.FORGE_REVIEW_FROM_EMAIL,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
  FORGE_IMAGE_PROVIDER: process.env.FORGE_IMAGE_PROVIDER,
  FORGE_IMAGE_MODEL: process.env.FORGE_IMAGE_MODEL,
  FORGE_IMAGE_BUCKET: process.env.FORGE_IMAGE_BUCKET,
  DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
  DATAFORSEO_LOCATION_CODE: process.env.DATAFORSEO_LOCATION_CODE,
  DATAFORSEO_LOCATION_NAME: process.env.DATAFORSEO_LOCATION_NAME,
  DATAFORSEO_LANGUAGE_CODE: process.env.DATAFORSEO_LANGUAGE_CODE,
  DATAFORSEO_LANGUAGE_NAME: process.env.DATAFORSEO_LANGUAGE_NAME,
  DATAFORSEO_INCLUDE_CLICKSTREAM: process.env.DATAFORSEO_INCLUDE_CLICKSTREAM,
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
