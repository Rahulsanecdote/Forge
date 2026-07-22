import { supabase } from '../supabase';
import type { ClientConfig } from './client-config';
import type { ClientContext } from './types';

// Upsert a client and its brand voice from a validated config. Shared by the CLIs.
export async function upsertClient(cfg: ClientConfig): Promise<{ id: string; slug: string; name: string }> {
  const { data: client, error } = await supabase
    .from('clients')
    .upsert(
      {
        slug: cfg.slug,
        name: cfg.name,
        industry: cfg.industry ?? null,
        website: cfg.website ?? null,
        locations: cfg.locations,
      },
      { onConflict: 'slug' },
    )
    .select()
    .single();
  if (error || !client) throw error ?? new Error('Failed to upsert client');

  const bv = cfg.brandVoice;
  const { error: bvErr } = await supabase.from('brand_voices').upsert(
    {
      client_id: client.id,
      tone: bv.tone,
      about: bv.about,
      audience: bv.audience,
      dos: bv.dos,
      donts: bv.donts,
      sample_posts: bv.samplePosts,
      banned_phrases: bv.bannedPhrases,
    },
    { onConflict: 'client_id' },
  );
  if (bvErr) throw bvErr;

  return { id: client.id, slug: client.slug, name: client.name };
}

function toContext(client: any, bv: any): ClientContext {
  return {
    id: client.id,
    slug: client.slug,
    name: client.name,
    industry: client.industry ?? null,
    website: client.website ?? null,
    locations: client.locations ?? 1,
    googleBusinessAccountId: client.google_business_account_id ?? null,
    googleBusinessLocationId: client.google_business_location_id ?? null,
    subscriptionStatus: client.subscription_status ?? null,
    billingOverride: client.billing_override ?? null,
    brandVoice: {
      tone: bv?.tone ?? [],
      about: bv?.about ?? '',
      audience: bv?.audience ?? '',
      dos: bv?.dos ?? [],
      donts: bv?.donts ?? [],
      samplePosts: bv?.sample_posts ?? [],
      bannedPhrases: bv?.banned_phrases ?? [],
    },
  };
}

export async function loadClient(slug: string): Promise<ClientContext> {
  const { data: client, error } = await supabase.from('clients').select('*').eq('slug', slug).single();
  if (error || !client) {
    throw new Error(`Client "${slug}" not found. Run "npm run forge:client:add" or "npm run forge:onboard" first.`);
  }
  const { data: bv } = await supabase.from('brand_voices').select('*').eq('client_id', client.id).single();
  return toContext(client, bv);
}

export async function listClients(): Promise<ClientContext[]> {
  const { data: clients, error } = await supabase.from('clients').select('*');
  if (error) throw error;
  if (!clients?.length) return [];

  const { data: voices } = await supabase.from('brand_voices').select('*');
  const byClient = new Map((voices ?? []).map((v: any) => [v.client_id, v]));
  return clients.map((c: any) => toContext(c, byClient.get(c.id)));
}
