#!/usr/bin/env node
// Environment contract validator — see docs/ENVIRONMENT_CONTRACT.md.
// Run with NODE_ENV=production to enforce the fail-closed production contract.

import { config } from 'dotenv';

config({ path: '.env', quiet: true });
config({ path: '.env.local', override: true, quiet: true });

const isProd = process.env.NODE_ENV === 'production';
const errors = [];

// Public vars required for the site (waitlist capture) in all envs.
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
  if (!process.env[key]) errors.push(`${key} is required`);
}

// No secrets may leak into NEXT_PUBLIC_ vars.
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith('NEXT_PUBLIC_') || !value) continue;
  if (/service_role/i.test(value) || /^sk-/.test(value)) {
    errors.push(`${key} appears to contain a secret — public vars must never carry secrets`);
  }
}

// Dev-only escape hatches are impossible in production.
if (isProd && process.env.AUTH_DISABLED === 'true') {
  errors.push('AUTH_DISABLED=true is forbidden when NODE_ENV=production');
}

// Server secrets required in production.
if (isProd) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FORGE_ADMIN_PASSWORD']) {
    if (!process.env[key]) errors.push(`${key} is required in production (server-only)`);
  }

  const provider = process.env.FORGE_PROVIDER ?? 'anthropic';
  const requiredByProvider = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    'openai-compatible': 'FORGE_BASE_URL',
  };
  const requiredKey = requiredByProvider[provider];
  if (!requiredKey) {
    errors.push(`FORGE_PROVIDER must be one of: ${Object.keys(requiredByProvider).join(', ')}`);
  } else if (!process.env[requiredKey]) {
    errors.push(`${requiredKey} is required in production for FORGE_PROVIDER=${provider}`);
  }
}

if (errors.length) {
  console.error('environment contract FAILED:');
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`environment contract OK (${isProd ? 'production' : 'development'} rules).`);
