import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedFetch, supabaseRequestTimeout } from '../src/timed-fetch.mjs';

test('passes through a successful response and forwards request options', async () => {
  const response = { ok: true, status: 200 };
  let seenSignal;
  const timedFetch = createTimedFetch({
    fetchImpl: async (_input, init) => { seenSignal = init.signal; return response; },
    timeoutMs: 100,
  });
  assert.equal(await timedFetch('https://example.test'), response);
  assert.ok(seenSignal instanceof AbortSignal);
  assert.equal(seenSignal.aborted, false);
});

test('aborts a stalled request and reports a timeout instead of hanging', async () => {
  let wasAborted = false;
  const timedFetch = createTimedFetch({
    timeoutMs: 15,
    fetchImpl: (_input, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        wasAborted = true;
        const error = new Error('fetch aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  await assert.rejects(timedFetch('https://example.test/slow'), (error) => error.name === 'TimeoutError');
  assert.equal(wasAborted, true);
});

test('preserves caller cancellation and does not mislabel it as a timeout', async () => {
  const external = new AbortController();
  const timedFetch = createTimedFetch({
    timeoutMs: 1000,
    fetchImpl: (_input, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('cancelled by caller');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  const request = timedFetch('https://example.test/cancel', { signal: external.signal });
  external.abort();
  await assert.rejects(request, (error) => error.name === 'AbortError');
});

test('uses shorter deadlines for auth and longer deadlines for AI functions', () => {
  assert.equal(supabaseRequestTimeout('https://abc.supabase.co/auth/v1/token'), 15000);
  assert.equal(supabaseRequestTimeout('https://abc.supabase.co/functions/v1/hamghadam-ai'), 60000);
  assert.equal(supabaseRequestTimeout('https://abc.supabase.co/rest/v1/profiles'), 30000);
});
