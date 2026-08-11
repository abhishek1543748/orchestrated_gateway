import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DeadLetterStore } from './DeadLetterStore';
import { IncomingMessage } from '../types';

function makeMsg(id: string): IncomingMessage {
  return { id, source: 'test', receivedAt: new Date().toISOString(), payload: {} };
}

describe('DeadLetterStore', () => {
  test('starts empty — getCount() is 0 and getAll() is []', () => {
    const store = new DeadLetterStore();
    assert.equal(store.getCount(), 0);
    assert.deepEqual(store.getAll(), []);
  });

  test('getAll() contains the messages and reasons that were added', () => {
    const store = new DeadLetterStore();
    store.add(makeMsg('msg-a'), 'timeout');
    store.add(makeMsg('msg-b'), 'failed after 3 attempts');

    const all = store.getAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].msg.id, 'msg-a');
    assert.equal(all[0].reason, 'timeout');
    assert.equal(all[1].msg.id, 'msg-b');
    assert.equal(all[1].reason, 'failed after 3 attempts');
  });

  test('getCount() increments for each add()', () => {
    const store = new DeadLetterStore();
    store.add(makeMsg('1'), 'err');
    assert.equal(store.getCount(), 1);
    store.add(makeMsg('2'), 'err');
    assert.equal(store.getCount(), 2);
  });

  test('getAll() returns a reference — mutations from outside affect the store', () => {
    // This test documents a known behaviour (not a bug, but worth knowing).
    // The store returns its internal array directly.
    const store = new DeadLetterStore();
    store.add(makeMsg('x'), 'reason');
    const all = store.getAll();
    assert.equal(all.length, 1);
  });
});
