import { Membrane } from "../src";

describe('Memory leaks caused (or fixed) by the membrane', () => {
    it.skip('should allow garbage collection of un-revoked proxies and targets if they go out of scope', () => {
        const membrane = new Membrane();
        const dryHandler = membrane.getHandlerByName('dry', { mustCreate: true});
        const wetHandler = membrane.getHandlerByName('wet', { mustCreate: true});

        let dryObject: {} | null = {};
        
        let wetProxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, dryObject);

        // TODO: track dryObject and wetProxy using a finalizationRegistry

        wetProxy = null;

        // TODO: trigger garbage collection, and ensure that wetProxy is GC'd

        dryObject = null;

        // TODO: trigger garbage collection, and ensure that dryObject is GC'd
    });
})