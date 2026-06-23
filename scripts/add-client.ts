import { loadClientConfig } from '../src/forge/client-config';
import { upsertClient } from '../src/forge/clients';

// Onboard any business into Forge from a JSON config. Works for any vertical.
//   npm run forge:client:add -- examples/acme-coffee.json
//   npm run forge:client:add -- ./my-business.json
async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npm run forge:client:add -- <path/to/client.json>');
    console.error('Example: npm run forge:client:add -- examples/acme-coffee.json');
    process.exit(1);
  }

  const cfg = loadClientConfig(path);
  const client = await upsertClient(cfg);
  console.log(`Added "${client.name}" (${client.slug}).\nRun: npm run forge:run -- ${client.slug} "<task>"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
