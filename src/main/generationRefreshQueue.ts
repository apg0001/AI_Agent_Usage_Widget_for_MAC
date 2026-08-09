export type GenerationRefreshTask<T> = (generation: number) => Promise<T | null>;

/**
 * Coalesces ordinary refreshes while guaranteeing that invalidating mutations
 * cause the active request to be discarded and rerun for the newest generation.
 */
export class GenerationRefreshQueue<T> {
  private generation = 0;
  private inFlight: Promise<T> | null = null;

  constructor(private readonly task: GenerationRefreshTask<T>) {}

  isCurrent(generation: number) {
    return generation === this.generation;
  }

  invalidate() {
    this.generation += 1;
  }

  refresh(): Promise<T> {
    if (this.inFlight) {
      return this.inFlight;
    }

    const request = this.runUntilCurrent();
    this.inFlight = request;
    void request.then(
      () => this.clear(request),
      () => this.clear(request)
    );
    return request;
  }

  private async runUntilCurrent(): Promise<T> {
    while (true) {
      const generation = this.generation;
      const result = await this.task(generation);
      if (result !== null && this.isCurrent(generation)) {
        return result;
      }
    }
  }

  private clear(request: Promise<T>) {
    if (this.inFlight === request) {
      this.inFlight = null;
    }
  }
}
