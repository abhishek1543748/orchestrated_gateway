export interface Queue<T> {
  /**
   * Add an item to the queue. Returns false if the queue is already full.
   */
  enqueue(item: T): boolean;

  /** Remove and return the next item, or undefined if empty. */
  dequeue(): T | undefined;

  /** Current number of items waiting. */
  depth(): number;

  /** True when the queue reached its configured capacity. */
  isFull(): boolean;
}
