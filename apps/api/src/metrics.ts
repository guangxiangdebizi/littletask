const knownMethods = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
const knownStatuses = new Set(['1xx', '2xx', '3xx', '4xx', '5xx']);

export class MetricsRegistry {
  private readonly requestCounts = new Map<string, number>();
  private readonly requestDurations = new Map<string, { count: number; seconds: number }>();

  observe(method: string, route: string, statusCode: number, durationMs: number): void {
    const status = `${Math.floor(statusCode / 100)}xx`;
    if (!knownStatuses.has(status)) return;
    const boundedMethod = knownMethods.has(method) ? method : 'OTHER';
    const labels = `${boundedMethod}|${route}|${status}`;
    this.requestCounts.set(labels, (this.requestCounts.get(labels) ?? 0) + 1);
    const duration = this.requestDurations.get(labels) ?? { count: 0, seconds: 0 };
    duration.count += 1;
    duration.seconds += Math.max(0, durationMs) / 1_000;
    this.requestDurations.set(labels, duration);
  }

  render(): string {
    const lines = [
      '# HELP littletask_http_requests_total HTTP requests grouped by bounded route labels.',
      '# TYPE littletask_http_requests_total counter',
    ];
    for (const [labels, value] of [...this.requestCounts.entries()].toSorted()) {
      lines.push(`littletask_http_requests_total${this.labels(labels)} ${value}`);
    }
    lines.push(
      '# HELP littletask_http_request_duration_seconds HTTP request duration.',
      '# TYPE littletask_http_request_duration_seconds summary',
    );
    for (const [labels, value] of [...this.requestDurations.entries()].toSorted()) {
      lines.push(
        `littletask_http_request_duration_seconds_sum${this.labels(labels)} ${value.seconds}`,
      );
      lines.push(
        `littletask_http_request_duration_seconds_count${this.labels(labels)} ${value.count}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }

  private labels(value: string): string {
    const [method, route, status] = value.split('|');
    return `{method="${method}",route="${route}",status="${status}"}`;
  }
}
