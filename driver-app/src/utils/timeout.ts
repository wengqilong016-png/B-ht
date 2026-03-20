/**
 * Races `promise` against a timeout.  If the timeout fires first the returned
 * promise rejects with `{ timedOut: true }`.
 *
 * Usage:
 *   const result = await withTimeout(somePromise, 15_000);
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject({ timedOut: true }), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
