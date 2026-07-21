// Pure helpers for post-image generation — no env/network, so prompt building and
// file naming stay unit-testable.

export function imageExtensionForMediaType(mediaType: string | undefined): 'jpg' | 'png' | 'webp' {
  if (!mediaType) return 'png';
  if (mediaType.includes('jpeg') || mediaType.includes('jpg')) return 'jpg';
  if (mediaType.includes('webp')) return 'webp';
  return 'png';
}

// Turn the post's `image_direction` plus brand context into an image-model prompt.
// Kept generic/illustrative on purpose — the operator must review the result before it
// is attached to a post, since AI imagery of a real business can misrepresent it.
export function buildImagePrompt(input: {
  businessName: string;
  industry?: string | null;
  tone?: string[];
  imageDirection: string;
}): string {
  const tone = (input.tone ?? []).map((value) => value.trim()).filter(Boolean).join(', ');
  const industry = input.industry?.trim();
  return [
    `Marketing photo for ${input.businessName}${industry ? ` (${industry})` : ''}.`,
    `Creative direction: ${input.imageDirection.trim()}.`,
    tone ? `Visual mood: ${tone}.` : '',
    'Photorealistic, high quality, social-media ready. No watermarks and no gibberish text.',
  ]
    .filter(Boolean)
    .join(' ');
}
