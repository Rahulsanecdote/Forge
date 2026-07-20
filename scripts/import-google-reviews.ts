import { loadClient } from '../src/forge/clients';
import { importGoogleBusinessProfileReviewsForClient } from '../src/forge/data/google-business-profile';

const slug = process.argv[2]?.trim();
if (!slug) {
  console.error('Usage: npm run forge:reviews:import -- <client-slug>');
  process.exit(1);
}

const client = await loadClient(slug);
const result = await importGoogleBusinessProfileReviewsForClient(client);
console.log(JSON.stringify(result, null, 2));
