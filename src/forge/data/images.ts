import { randomUUID } from 'node:crypto';
import { experimental_generateImage as generateImage } from 'ai';
import { env } from '../../env';
import { supabase } from '../../supabase';
import { isImageGenerationConfigured, resolveImageModel, resolveImageProvider } from '../image-model';
import { buildImagePrompt, imageExtensionForMediaType } from './image-prompt';

const BUCKET = env.FORGE_IMAGE_BUCKET ?? 'content-images';

export type GeneratePostImageResult =
  | { generated: true; assetId: string; publicUrl: string; storagePath: string; mediaType: string }
  | { generated: false; code: 'unconfigured'; reason: string };

// Generate a post creative from its image_direction, upload it to a public Supabase
// Storage bucket, and record it in content_assets. Fails closed when image generation
// is not configured; throws on generation/storage errors so no false success is recorded.
export async function generateAndStorePostImage(input: {
  runId: string;
  clientId: string | null;
  postIndex: number;
  assetIndex?: number;
  imageDirection: string;
  businessName: string;
  industry?: string | null;
  tone?: string[];
}): Promise<GeneratePostImageResult> {
  const assetIndex = input.assetIndex ?? 0;
  if (!isImageGenerationConfigured()) {
    return {
      generated: false,
      code: 'unconfigured',
      reason: 'Image generation is not configured. Set FORGE_IMAGE_PROVIDER and the matching provider API key.',
    };
  }

  const prompt = buildImagePrompt({
    businessName: input.businessName,
    industry: input.industry,
    tone: input.tone,
    imageDirection: input.imageDirection,
  });

  const { image } = await generateImage({ model: resolveImageModel(), prompt, aspectRatio: '1:1' });

  const mediaType = image.mediaType ?? 'image/png';
  const storagePath = `${input.runId}/${input.postIndex}-${assetIndex}-${randomUUID()}.${imageExtensionForMediaType(mediaType)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, image.uint8Array, { contentType: mediaType, upsert: true });
  if (uploadError) throw uploadError;

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  const { data: asset, error: insertError } = await supabase
    .from('content_assets')
    .upsert(
      {
        run_id: input.runId,
        client_id: input.clientId,
        post_index: input.postIndex,
        asset_index: assetIndex,
        kind: 'image',
        provider: resolveImageProvider(),
        prompt,
        storage_path: storagePath,
        public_url: publicUrl,
        media_type: mediaType,
        status: 'ready',
      },
      { onConflict: 'run_id,post_index,asset_index,kind' },
    )
    .select('id')
    .single();
  if (insertError || !asset) throw insertError ?? new Error('Failed to record content asset.');

  return { generated: true, assetId: asset.id, publicUrl, storagePath, mediaType };
}

// Remove one image slot: delete the stored object (best-effort) and its content_assets
// row. Returns whether a row was deleted so the caller can report a no-op distinctly.
export async function deleteStoredPostImage(input: {
  runId: string;
  postIndex: number;
  assetIndex: number;
}): Promise<{ deleted: boolean }> {
  const { data: asset } = await supabase
    .from('content_assets')
    .select('id, storage_path')
    .eq('run_id', input.runId)
    .eq('post_index', input.postIndex)
    .eq('asset_index', input.assetIndex)
    .eq('kind', 'image')
    .maybeSingle();
  if (!asset) return { deleted: false };

  if (asset.storage_path) {
    await supabase.storage.from(BUCKET).remove([asset.storage_path]);
  }

  const { error } = await supabase.from('content_assets').delete().eq('id', asset.id);
  if (error) throw error;
  return { deleted: true };
}
