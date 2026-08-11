import { IncomingMessage } from "../types";

export class DeadLetterStore {
  private readonly deadLetters: {msg: IncomingMessage; reason: string}[] = [];
  private total = 0;

  add(msg: IncomingMessage, reason: string): void {
    this.total++;
    this.deadLetters.push({msg, reason});
  }

  getAll(): {msg: IncomingMessage; reason: string}[] {
    return this.deadLetters;
  }

  getCount(): number {
    return this.total;
  }
}
