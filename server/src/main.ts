import { ConfigError, loadConfig } from './config';
import { Log, createExtractionHandler } from './extraction-handler';
import { createNodeServer } from './node-server';
import { openAiResponsesClient } from './openai-client';

/** One JSON line per event; fields are codes, counts and durations only (see extraction-handler.ts). */
const log: Log = (event, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof ConfigError ? `Invalid configuration: ${error.message}` : 'Invalid configuration.');
  process.exit(1);
}

if (!config.openAi) {
  log('server.not-configured', { missing: 'OPENAI_API_KEY and/or OPENAI_MODEL' });
}
if (config.allowedOrigins.length === 0) {
  log('server.no-allowed-origins');
}

const client = config.openAi ? openAiResponsesClient(config.openAi) : null;
const server = createNodeServer(createExtractionHandler({ config, client, log }));
server.listen(config.port, config.host, () => {
  const address = server.address();
  log('server.listening', { host: config.host, port: typeof address === 'object' && address ? address.port : config.port });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
