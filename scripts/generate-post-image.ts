import { supabase } from '../src/supabase';
import { generateAndStorePostImage } from '../src/forge/data/images';

// Generate + store an image for one post of a create_social_posts run.
//   npm run forge:image:generate -- <runId> [postIndex]
const runId = process.argv[2]?.trim();
const postIndex = Number.parseInt(process.argv[3] ?? '0', 10);

if (!runId || !Number.isFinite(postIndex)) {
  console.error('Usage: npm run forge:image:generate -- <runId> [postIndex]');
  process.exit(1);
}

const { data: run, error } = await supabase
  .from('tool_runs')
  .select('id, client_id, tool, output')
  .eq('id', runId)
  .maybeSingle();
if (error || !run) {
  console.error(`Run ${runId} not found.`);
  process.exit(1);
}
if (run.tool !== 'create_social_posts') {
  console.error(`Run ${runId} is a "${run.tool}" run, not create_social_posts.`);
  process.exit(1);
}

const posts = (run.output as { posts?: Array<{ caption?: string; image_direction?: string }> } | null)?.posts ?? [];
const post = posts[postIndex];
if (!post) {
  console.error(`No post at index ${postIndex} (run has ${posts.length}).`);
  process.exit(1);
}

let businessName = 'the business';
let industry: string | null = null;
let tone: string[] = [];
if (run.client_id) {
  const { data: client } = await supabase.from('clients').select('name, industry').eq('id', run.client_id).maybeSingle();
  const { data: brandVoice } = await supabase.from('brand_voices').select('tone').eq('client_id', run.client_id).maybeSingle();
  businessName = client?.name ?? businessName;
  industry = client?.industry ?? null;
  tone = brandVoice?.tone ?? [];
}

const result = await generateAndStorePostImage({
  runId,
  clientId: run.client_id,
  postIndex,
  imageDirection: post.image_direction || post.caption || 'On-brand marketing photo.',
  businessName,
  industry,
  tone,
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.generated ? 0 : 1);
