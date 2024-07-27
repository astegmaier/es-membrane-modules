import { Membrane } from "../src";
import { generateSnapshotOnFailure } from "./testUtils/generateSnapshotOnFailure";
import { forceGc } from "./testUtils/forceGc";

/** 
 * We give objects we expect to possibly leak a distinct name so 
 * we can find them in the heap snapshot in case something goes wrong.
 */
class PotentiallyLeakyClass {
  testName: string | undefined;
  constructor() {
    this.testName = expect.getState()?.currentTestName;
  }
}

describe("Memory leaks caused (or fixed) by the membrane", () => {
  it("jest tests should be able to detect basic garbage collection", async () => {
    let myObject: PotentiallyLeakyClass | null = new PotentiallyLeakyClass();
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);
    finalizationRegistry.register(myObject, "myObject");
    myObject = null;
    await forceGc();
    generateSnapshotOnFailure(() => expect(finalizationFn).toHaveBeenCalledWith("myObject"));
  });

  it.skip("should allow garbage collection of un-revoked proxies and targets when the membrane is revoked", async () => {
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

    let wetObject: PotentiallyLeakyClass | null = new PotentiallyLeakyClass();
    let dryProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetObject);
    finalizationRegistry.register(wetObject, "wetObject");
    finalizationRegistry.register(dryProxy, "dryProxy");

    dryProxy = null;
    await forceGc();
    generateSnapshotOnFailure(() => expect(finalizationFn).toHaveBeenCalledWith("dryProxy"));

    wetObject = null;
    await forceGc();
    generateSnapshotOnFailure(() => expect(finalizationFn).toHaveBeenCalledWith("wetObject"));
  });

  it.skip("should allow for a wet objects to be garbage collected after the membrane is revoked, even if something is still retaining the dry proxy to it", async () => {
    const finalizationFn = jest.fn();
    const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

    let wetObject: PotentiallyLeakyClass | null = new PotentiallyLeakyClass();
    let dryProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetObject);
    finalizationRegistry.register(wetObject, "wetObject");
    finalizationRegistry.register(dryProxy, "dryProxy");

    dryHandler.revokeEverything();
    wetHandler.revokeEverything();
    wetObject = null;
    // Note: we are _not_ releasing a reference to the dryProxy, and we're expecting the membrane revocation to allow the cleanup of the wetObject.

    await forceGc();
    generateSnapshotOnFailure(() => expect(finalizationFn).toHaveBeenCalledWith("wetObject"));
  });
});
