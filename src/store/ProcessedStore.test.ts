import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessedStore } from './ProcessedStore';
import { IncomingMessage } from '../types';

function makeMsg(id: string, source = 'test-source'): IncomingMessage {
  return { id, source, receivedAt: new Date().toISOString(), payload: {} };
}

describe('ProcessedStore', () => {
  test('has() returns false for a message that has not been added', () => {
    const store = new ProcessedStore();
    assert.equal(store.has(makeMsg('msg-001')), false);
  });

  test('has() returns true after add()', () => {
    const store = new ProcessedStore();
    const msg = makeMsg('msg-001');
    store.add(msg);
    assert.equal(store.has(msg), true);
  });

  test('deduplicates by composite source:id key — same id, different source is NOT a duplicate', () => {
    const store = new ProcessedStore();
    store.add(makeMsg('123', 'github'));
    assert.equal(store.has(makeMsg('123', 'github')), true);
    assert.equal(store.has(makeMsg('123', 'stripe')), false); // different source → different key
  });

  test('same source, different id — treated as separate messages', () => {
    const store = new ProcessedStore();
    store.add(makeMsg('aaa', 'github'));
    assert.equal(store.has(makeMsg('aaa', 'github')), true);
    assert.equal(store.has(makeMsg('bbb', 'github')), false);
  });

  test('size() reflects the number of unique messages added', () => {
    const store = new ProcessedStore();
    assert.equal(store.size(), 0);
    store.add(makeMsg('a'));
    store.add(makeMsg('b'));
    assert.equal(store.size(), 2);
  });

  test('adding the same message twice does not double-count in size()', () => {
    const store = new ProcessedStore();
    const msg = makeMsg('dup');
    store.add(msg);
    store.add(msg); // second add — Set should deduplicate
    assert.equal(store.size(), 1);
  });
});
