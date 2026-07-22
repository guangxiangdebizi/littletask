import type { AppConfig } from './config';
import type { IntakeService } from './intake-service';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig;
    intakeService: IntakeService;
  }
}
