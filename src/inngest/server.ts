import { createServer } from 'node:http';
import { serve } from 'inngest/node';
import { inngest } from './client';
import { functions } from './functions';

const port = Number(process.env.PORT ?? 3030);
const handler = serve({ client: inngest, functions });

createServer((req, res) => {
  void handler(req, res);
}).listen(port, () => {
  console.log(`Forge Inngest endpoint: http://localhost:${port}/api/inngest`);
  console.log('In another terminal, start the Inngest dev server:');
  console.log('  npx inngest-cli@latest dev');
});
