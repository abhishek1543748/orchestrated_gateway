import { IncomingMessage } from "../types";

export class ProcessedStore {
  private readonly processed = new Set<string>();

  add(msg: IncomingMessage): void {
    this.processed.add(`${msg.source}:${msg.id}`);
  }

  has(msg: IncomingMessage): boolean {
    return this.processed.has(`${msg.source}:${msg.id}`);
  }

  size(): number {
    return this.processed.size;
  }
}
