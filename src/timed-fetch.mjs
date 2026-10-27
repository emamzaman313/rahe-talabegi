/** Abort stalled HTTP requests while preserving caller cancellation. */
export function createTimedFetch({ fetchImpl = globalThis.fetch, timeoutMs = 30000, timeoutFor } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  return async function timedFetch(input, init = {}) {
    const parentSignal = init?.signal ?? input?.signal ?? null;
    const requestedTimeout = typeof timeoutFor === 'function' ? timeoutFor(input) : timeoutMs;
    const duration = Number(requestedTimeout);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Request timeout must be a positive finite number');
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener?.('abort', abortFromParent, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, duration);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        const timeoutError = new Error(`Network request timed out after ${duration} ms`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', abortFromParent);
    }
  };
}

export function supabaseRequestTimeout(input) {
  const url = typeof input === 'string' ? input : String(input?.url || '');
  if (/\/auth\/v1(?:\/|$)/i.test(url)) return 15000;
  if (/\/functions\/v1(?:\/|$)/i.test(url)) return 60000;
  return 30000;
}
