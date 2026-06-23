import { resolveModel } from '../src/forge/model';
import { generateClientConfig } from '../src/forge/onboarding';
import { upsertClient } from '../src/forge/clients';

// Onboard a brand-new client from a plain-language description — Forge drafts the brand voice.
//   pnpm forge:onboard "Bright Smile Dental" "A gentle family dental practice in Jersey City"
async function main() {
  const name = process.argv[2];
  const description = process.argv.slice(3).join(' ');
  if (!name || !description) {
    console.error('Usage: pnpm forge:onboard "<business name>" "<one-paragraph description>"');
    console.error(
      'Example: pnpm forge:onboard "Bright Smile Dental" "A gentle family dental practice focused on anxiety-free care"',
    );
    process.exit(1);
  }

  const model = resolveModel();
  console.log(`Generating brand voice for "${name}"...`);
  const cfg = await generateClientConfig({ name, description, model });
  const client = await upsertClient(cfg);

  console.log(`\nOnboarded "${client.name}" (${client.slug}).`);
  console.log('Generated brand voice:\n' + JSON.stringify(cfg.brandVoice, null, 2));
  console.log(`\nNext: pnpm forge:run ${client.slug} "Write 3 launch posts"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
