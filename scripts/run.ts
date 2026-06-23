import { loadClient } from '../src/forge/clients';
import { runForge } from '../src/forge/runtime';

async function main() {
  const [slug, ...rest] = process.argv.slice(2);
  const task = rest.join(' ');
  if (!slug || !task) {
    console.error('Usage: npm run forge:run -- <client-slug> "<task>"');
    process.exit(1);
  }

  const client = await loadClient(slug);
  console.log(`\n> Forge running for ${client.name}\n  Task: ${task}\n`);

  const result = await runForge({ client, task });

  console.log('--- Summary ---\n' + result.text + '\n');
  if (result.steps.length) {
    console.log('--- Tool output ---');
    for (const s of result.steps) {
      console.log(`\n[${s.tool}]\n` + JSON.stringify(s.output, null, 2));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
