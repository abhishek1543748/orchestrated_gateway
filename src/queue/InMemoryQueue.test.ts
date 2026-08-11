import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryQueue } from './InMemoryQueue';

describe('InMemoryQueue', () => {
  test('dequeues items in FIFO order', () => {
    const q = new InMemoryQueue<number>(10);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    assert.equal(q.dequeue(), 1);
    assert.equal(q.dequeue(), 2);
    assert.equal(q.dequeue(), 3);
  });

  test('returns undefined when dequeuing from an empty queue', () => {
    const q = new InMemoryQueue<number>(10);
    assert.equal(q.dequeue(), undefined);
  });

  test('enqueue returns false and refuses item when queue is at capacity', () => {
    const q = new InMemoryQueue<number>(3);
    assert.equal(q.enqueue(1), true);
    assert.equal(q.enqueue(2), true);
    assert.equal(q.enqueue(3), true);
    assert.equal(q.enqueue(4), false); // should be rejected
    assert.equal(q.depth(), 3);        // queue must not exceed capacity
  });

  test('isFull() returns true exactly at capacity', () => {
    const q = new InMemoryQueue<number>(2);
    assert.equal(q.isFull(), false);
    q.enqueue(1);
    assert.equal(q.isFull(), false);
    q.enqueue(2);
    assert.equal(q.isFull(), true);
  });

  test('depth() reflects the current item count accurately', () => {
    const q = new InMemoryQueue<number>(10);
    assert.equal(q.depth(), 0);
    q.enqueue(1);
    assert.equal(q.depth(), 1);
    q.enqueue(2);
    assert.equal(q.depth(), 2);
    q.dequeue();
    assert.equal(q.depth(), 1);
    q.dequeue();
    assert.equal(q.depth(), 0);
  });

  test('capacity-1 queue accepts one item and then rejects the next', () => {
    const q = new InMemoryQueue<string>(1);
    assert.equal(q.enqueue('only'), true);
    assert.equal(q.enqueue('rejected'), false);
    assert.equal(q.dequeue(), 'only');
    // After draining, it should accept again
    assert.equal(q.enqueue('back'), true);
  });
});
