import { Membrane } from "../src";

describe('Memory leaks caused (or fixed) by the membrane', () => {
    it.skip('should allow garbage collection of un-revoked proxies and targets if they go out of scope', () => {
        const finalizationFn = jest.fn
        const finalizationRegistry = new FinalizationRegistry<string>(finalizationFn);

        const membrane = new Membrane();
        const dryHandler = membrane.getHandlerByName('dry', { mustCreate: true});
        const wetHandler = membrane.getHandlerByName('wet', { mustCreate: true});

        let dryObject: {} | null = {};
        let wetProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, dryObject);
        finalizationRegistry.register(dryObject, 'dryObject');
        finalizationRegistry.register(wetProxy, 'wetProxy');

        // TODO: remove this - eventually we want to make sure that this is not actually necessary to get the tests passing.
        dryHandler.revokeEverything();
        wetHandler.revokeEverything();

        wetProxy = null;

        // TODO: trigger garbage collection, and ensure that wetProxy is GC'd

        dryObject = null;

        // TODO: trigger garbage collection, and ensure that dryObject is GC'd
    });
    // TODO: add another test that makes sure that dryObject can be GC'd after revoke even if wetProxy is still in scope.
})