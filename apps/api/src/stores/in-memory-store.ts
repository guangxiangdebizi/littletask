import type { Insight, Intake } from '@littletask/contracts';

import type { IntakeStore } from '../types';

export class InMemoryIntakeStore implements IntakeStore {
  readonly #intakes = new Map<string, Intake>();
  readonly #insights = new Map<string, Insight[]>();
  readonly #confirmations = new Map<string, string>();

  create(intake: Intake): void {
    if (this.#intakes.has(intake.id)) {
      throw new Error(`Intake already exists: ${intake.id}`);
    }
    this.#intakes.set(intake.id, structuredClone(intake));
  }

  get(id: string): Intake | undefined {
    const intake = this.#intakes.get(id);
    return intake ? structuredClone(intake) : undefined;
  }

  list(): Intake[] {
    return [...this.#intakes.values()]
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((intake) => structuredClone(intake));
  }

  replace(intake: Intake): void {
    if (!this.#intakes.has(intake.id)) {
      throw new Error(`Intake not found: ${intake.id}`);
    }
    this.#intakes.set(intake.id, structuredClone(intake));
  }

  delete(id: string): boolean {
    this.#insights.delete(id);
    return this.#intakes.delete(id);
  }

  getInsights(intakeId: string): Insight[] {
    return structuredClone(this.#insights.get(intakeId) ?? []);
  }

  setInsights(intakeId: string, insights: Insight[]): void {
    this.#insights.set(intakeId, structuredClone(insights));
  }

  rememberConfirmation(idempotencyKey: string, actionId: string): void {
    this.#confirmations.set(idempotencyKey, actionId);
  }

  getConfirmation(idempotencyKey: string): string | undefined {
    return this.#confirmations.get(idempotencyKey);
  }
}
