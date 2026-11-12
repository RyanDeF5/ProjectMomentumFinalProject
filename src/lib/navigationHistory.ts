/** Session-only history. Back consumes entries rather than adding a new visit. */
export class NavigationHistory<T> {
  private entries: T[] = [];
  private readonly limit: number;

  constructor(limit = 30) {
    this.limit = Math.max(1, limit);
  }

  push(entry: T) {
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
  }

  pop(): T | undefined {
    return this.entries.pop();
  }

  clear() {
    this.entries = [];
  }
}
