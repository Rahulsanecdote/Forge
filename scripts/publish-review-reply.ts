import { loadClient } from '../src/forge/clients';
import { listDraftedGoogleReplies, publishDraftedReviewReply } from '../src/forge/data/google-business-profile';

// List a client's drafted Google review replies, or publish one by id.
//   npm run forge:reviews:publish -- <client-slug>                       # list drafts
//   npm run forge:reviews:publish -- <client-slug> --publish <reviewId>  # publish one
const slug = process.argv[2]?.trim();
const flag = process.argv[3]?.trim();
const reviewId = process.argv[4]?.trim();

if (!slug) {
  console.error('Usage: npm run forge:reviews:publish -- <client-slug> [--publish <reviewId>]');
  process.exit(1);
}

const client = await loadClient(slug);

if (flag === '--publish') {
  if (!reviewId) {
    console.error('Usage: npm run forge:reviews:publish -- <client-slug> --publish <reviewId>');
    process.exit(1);
  }
  const result = await publishDraftedReviewReply(reviewId);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.published ? 0 : 1);
}

const drafts = await listDraftedGoogleReplies(client.id);
if (drafts.length === 0) {
  console.log(`No drafted Google replies for ${client.name}.`);
} else {
  console.log(`Drafted Google replies for ${client.name}:\n`);
  for (const draft of drafts) {
    const preview = (draft.draft_reply ?? '').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`${draft.id}  ${draft.rating}★  ${draft.author}: ${preview}`);
  }
  console.log(`\nPublish one with:\n  npm run forge:reviews:publish -- ${slug} --publish <reviewId>`);
}
