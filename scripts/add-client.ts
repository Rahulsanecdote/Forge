import { loadClientConfig } from '../src/forge/client-config';
import { upsertClient } from '../src/forge/clients';

// Onboard any business into Forge from a JSON config. Works for any vertical.
//   pnpm forge:client:add examples/acme-coffee.json
//   pnpm forge:client:add ./my-business.json
async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: pnpm forge:client:add <path/to/client.json>');
    console.error('Example: pnpm forge:client:add examples/acme-coffee.json');
    process.exit(1);
  }

  const cfg = loadClientConfig(path);
  const client = await upsertClient(cfg);
  console.log(`Added "${client.name}" (${client.slug}).\nRun: pnpm forge:run ${client.slug} "<task>"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
