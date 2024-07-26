import { Membrane } from "../src";

interface GlobalWithAsyncGc {
  gc(params: { execution: "async" }): Promise<void>;
}

/**
 * Forces garbage collection. This will throw if node was not launched with the --expose-gc flag.
 * @param retries - Number of times to retry GC. Experimentally, 2 seems sufficient.
 */
async function forceGc(retries: number = 2): Promise<void> {
  if (!globalThis.gc) {
    throw new Error("Node was not launched with the --expose-gc flag.");
  }
  for (let i = 0; i < retries; i += 1) {
    await (globalThis as unknown as GlobalWithAsyncGc).gc({ execution: "async" });
  }
}

describe("Memory leaks caused (or fixed) by the membrane", () => {
  it("jest tests should be able to detect basic garbage collection", async () => {
    let myObject = {};
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);
    finalizationRegistry.register(myObject, "myObject");
    myObject = null;
    await forceGc();
    expect(finalizationFn).toHaveBeenCalledWith("myObject");
  });

  it.skip("should allow garbage collection of un-revoked proxies and targets when the membrane is revoked", async () => {
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

    let wetObject: {} | null = {};
    let dryProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetObject);
    finalizationRegistry.register(wetObject, "wetObject");
    finalizationRegistry.register(dryProxy, "dryProxy");

    dryProxy = null;
    await forceGc();
    expect(finalizationFn).toHaveBeenCalledWith("dryProxy");

    wetObject = null;
    await forceGc();
    expect(finalizationFn).toHaveBeenCalledWith("wetObject");
  });

  it.skip("should allow for a wet objects to be garbage collected after the membrane is revoked, even if something is still retaining the dry proxy to it", async () => {
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

    let wetObject: {} | null = {};
    let dryProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetObject);
    finalizationRegistry.register(wetObject, "wetObject");
    finalizationRegistry.register(dryProxy, "dryProxy");

    dryHandler.revokeEverything();
    wetHandler.revokeEverything();
    wetObject = null;
    // Note: we are _not_ releasing a reference to the dryProxy, and we're expecting the membrane revocation to allow the cleanup of the wetObject.

    await forceGc();
    expect(finalizationFn).toHaveBeenCalledWith("wetObject");
  });
});
