#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config.js';
import { KicktippClient } from '../core/kicktipp-client.js';
import { buildMcpServer } from '../mcp/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new KicktippClient(config);
  const server = buildMcpServer(client);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
