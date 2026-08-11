import { Queue } from "./Queue";

export class InMemoryQueue<T> implements Queue<T> {
  private items: T[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  enqueue(item: T): boolean {
    if (this.isFull()) return false;
    this.items.push(item);
    return true;
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  depth(): number {
    return this.items.length;
  }

  isFull(): boolean {
    return this.items.length >= this.capacity;
  }
}
