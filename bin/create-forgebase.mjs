#!/usr/bin/env node
import { run } from '../src/cli/index.mjs';

run(process.argv.slice(2)).catch((error) => {
  console.error(`\n${error?.stack ?? error}\n`);
  process.exit(1);
});
