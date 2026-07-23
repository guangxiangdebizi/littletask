import path from 'node:path';

import { config } from 'dotenv';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const explicitPath = process.env.LITTLETASK_ENV_FILE;

config({
  path: explicitPath
    ? [explicitPath]
    : [path.join(repositoryRoot, '.env.local'), path.join(repositoryRoot, '.env')],
  quiet: true,
});
