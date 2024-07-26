interface GlobalWithAsyncGc {
  gc(params: { execution: "async" }): Promise<void>;
}

/**
 * Forces garbage collection. This will throw if node was not launched with the --expose-gc flag.
 * @param retries - Number of times to retry GC. Experimentally, 2 seems sufficient.
 */
export async function forceGc(retries: number = 2): Promise<void> {
  if (!globalThis.gc) {
    throw new Error("Node was not launched with the --expose-gc flag.");
  }
  for (let i = 0; i < retries; i += 1) {
    await (globalThis as unknown as GlobalWithAsyncGc).gc({ execution: "async" });
  }
}
