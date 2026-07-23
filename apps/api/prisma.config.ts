import './src/load-env';

import { defineConfig } from 'prisma/config';

const localFallback = 'postgresql://littletask:littletask@127.0.0.1:5432/littletask';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || localFallback,
  },
});
