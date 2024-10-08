/* XXX ajvincent I'm not going to use the MembraneMocks in these tests, because
 * the mocks create proxies to objects before any listeners can be registered.
 * I could modify the mocks to take listeners through an options object, but
 * that is just going to make the mocks code more complicated than necessary.
 *
 * Similarly, the logger we create will not be attached to the membrane.
 */

import { loggerLib } from "../../mocks";
import { Membrane } from "../../src";
import type {
  AllListenerMetadata,
  IChainHandler,
  ObjectGraphHandler,
  UseShadowTargetMode
} from "../../src";

interface ITestObject1 {
  label: string;
  arg1: unknown;
  number: number;
}

interface ITestObject2 extends ITestObject1 {
  arg2: (...args: unknown[]) => void;
}

interface ITestObject3 {
  objectName?: string;
  objName?: string;
  child?: ITestObject3;
  parent?: ITestObject3;
  grandParent?: ITestObject3;
}

interface ITestObject1Constructor {
  new (arg1: unknown): ITestObject1;
  (arg1: unknown): ITestObject1;
}

interface ITestObject2Constructor {
  new (arg1: unknown, arg2: (...args: unknown[]) => void): ITestObject2;
  (arg1: unknown, arg2: (...args: unknown[]) => void): ITestObject2;
}

interface IAugmentedAppender extends loggerLib.Appender {
  getMessages(): string[];
}

describe("An object graph handler's proxy listeners", function () {
  let membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    appender: IAugmentedAppender,
    ctor1: ITestObject1Constructor;
  const logger = loggerLib.getLogger("test.membrane.proxylisteners");

  function getMessageProp(event: any) {
    return event.message;
  }
  function getMessages(this: loggerLib.Appender): string[] {
    return this.events.map(getMessageProp);
  }

  function mustSkip(value: unknown): boolean {
    return value === Object.prototype || value === ctor1 || value === ctor1.prototype;
  }

  beforeEach(function () {
    membrane = new Membrane({ logger: logger });
    wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });

    appender = new loggerLib.Appender() as IAugmentedAppender;
    logger.addAppender(appender);
    appender.getMessages = getMessages;
    appender.setThreshold("INFO");

    ctor1 = function (this: ITestObject1, arg1: unknown) {
      try {
        this.label = "ctor1 instance";
        this.arg1 = arg1;
      } catch (ex) {
        // do nothing, this is not that important to our tests
      }
    } as ITestObject1Constructor;
    ctor1.prototype.label = "ctor1 prototype";
    ctor1.prototype.number = 2;
  });

  afterEach(function () {
    logger.removeAppender(appender);

    wetHandler.revokeEverything();
    dryHandler.revokeEverything();

    membrane = null as any;
    wetHandler = null as any;
    dryHandler = null as any;
    appender = null as any;
  });

  /* XXX ajvincent I could use Jasmine spies, but for once, I don't like the
   * API that Jasmine spies presents.  Instead, I'll use the logger mocks to
   * record events and their order.
   */

  describe("are notified of a proxy before the proxy is returned", function () {
    /* We're not testing API of meta yet.  That'll be a separate test.
    The only reason we test for the proxy is to ensure the proxy is the same for
    the listeners and the returned value.
    */

    let meta0: AllListenerMetadata | undefined,
      meta1: AllListenerMetadata | undefined,
      meta2: AllListenerMetadata | undefined;
    function listener1(meta: AllListenerMetadata) {
      if (mustSkip(meta.target)) {
        return;
      }
      meta1 = meta;
      logger.info("listener1");
    }
    function listener2(meta: AllListenerMetadata) {
      if (mustSkip(meta.target)) {
        return;
      }
      meta2 = meta;
      logger.info("listener2");
    }
    function listener0(meta: AllListenerMetadata) {
      if (mustSkip(meta.target)) {
        return;
      }
      meta0 = meta;
      logger.info("listener0");
    }

    function reset() {
      appender.clear();
      meta0 = undefined;
      meta1 = undefined;
      meta2 = undefined;
    }

    beforeEach(function () {
      wetHandler.addProxyListener(listener0);
      wetHandler.addProxyListener(listener2);
      dryHandler.addProxyListener(listener1);
      dryHandler.addProxyListener(listener2);
      reset();
    });

    afterEach(reset);

    it("via membrane.convertArgumentToProxy", function () {
      var x = new ctor1("one");
      logger.info("x created");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      logger.info("dry(x) created");
      expect(X.label).toBe("ctor1 instance");
      expect(X).not.toBe(x);

      let messages = appender.getMessages();
      expect(messages.length).toBe(6);
      expect(messages[0]).toBe("x created");

      // origin ObjectGraphHandler's listeners
      expect(messages[1]).toBe("listener0");
      expect(messages[2]).toBe("listener2");

      // target ObjectGraphHandler's listeners
      expect(messages[3]).toBe("listener1");
      expect(messages[4]).toBe("listener2");

      expect(messages[5]).toBe("dry(x) created");

      expect(meta2).toBe(meta1);
      expect(typeof meta2).toBe("object");
      expect(meta0).not.toBe(undefined);
      expect(meta2!.proxy).toBe(X);
    });

    it("via wrapping a non-primitive property", function () {
      var y = {};
      var x = new ctor1(y);
      expect(x.arg1).toBe(y);
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      appender.clear();

      logger.info("X.y retrieval start");
      var Y = X.arg1;
      logger.info("X.y retrieval end");
      expect(Y).not.toBe(y);

      let messages = appender.getMessages();
      expect(messages.length).toBe(6);
      expect(messages[0]).toBe("X.y retrieval start");

      // origin ObjectGraphHandler's listeners
      expect(messages[1]).toBe("listener0");
      expect(messages[2]).toBe("listener2");

      // target ObjectGraphHandler's listeners
      expect(messages[3]).toBe("listener1");
      expect(messages[4]).toBe("listener2");

      expect(messages[5]).toBe("X.y retrieval end");

      expect(meta2).toBe(meta1);
      expect(typeof meta2).toBe("object");
      expect(meta0).not.toBe(undefined);
      expect(meta2!.proxy).toBe(Y);
    });

    it("via wrapping a primitive property", function () {
      var y = 4;
      var x = new ctor1(y);
      expect(x.arg1).toBe(y);
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      reset();

      logger.info("X.y retrieval start");
      var Y = X.arg1;
      logger.info("X.y retrieval end");
      expect(Y).toBe(y); // because it's a primitive

      let messages = appender.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0]).toBe("X.y retrieval start");
      expect(messages[1]).toBe("X.y retrieval end");

      expect(meta0).toBe(undefined);
      expect(meta1).toBe(undefined);
      expect(meta2).toBe(undefined);
    });

    it("via counter-wrapping a non-primitive argument", function () {
      let cbVal: { argIndex: number } | undefined;
      const Z = { argIndex: 0 },
        Z2 = { argIndex: 1 },
        rv = { isRV: true };
      function callback(k: { argIndex: number }) {
        logger.info("Entering callback");
        cbVal = k;
        logger.info("Exiting callback");
        return rv;
      }

      var x = new ctor1(callback);
      expect(x.arg1).toBe(callback);
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);

      {
        // @ts-ignore - TypeScript will complain that "'Y' is declared but its value is never read". But we still want to do this, since we're testing the side effects of reading 'arg1'.
        let _Y = X.arg1; // we've already tested this above
        reset();
        _Y = null;
      }

      logger.info("Calling X.arg1 start");
      var K = X.arg1(Z, Z2);
      logger.info("Calling X.arg1 end");
      expect(cbVal).not.toBe(undefined);
      expect(cbVal).not.toBe(null);
      expect(typeof cbVal).toBe("object");
      if (cbVal) {
        expect(cbVal.argIndex).toBe(0);
      }

      let messages = appender.getMessages();
      expect(messages.length).toBe(16);
      expect(messages[0]).toBe("Calling X.arg1 start");

      // for argument 0
      // origin ObjectGraphHandler's listeners
      expect(messages[1]).toBe("listener1");
      expect(messages[2]).toBe("listener2");
      // target ObjectGraphHandler's listeners
      expect(messages[3]).toBe("listener0");
      expect(messages[4]).toBe("listener2");

      // for argument 1
      // origin ObjectGraphHandler's listeners
      expect(messages[5]).toBe("listener1");
      expect(messages[6]).toBe("listener2");
      // target ObjectGraphHandler's listeners
      expect(messages[7]).toBe("listener0");
      expect(messages[8]).toBe("listener2");

      // executing the method
      expect(messages[9]).toBe("Entering callback");
      expect(messages[10]).toBe("Exiting callback");

      // for return value
      // origin ObjectGraphHandler's listeners
      expect(messages[11]).toBe("listener0");
      expect(messages[12]).toBe("listener2");
      // target ObjectGraphHandler's listeners
      expect(messages[13]).toBe("listener1");
      expect(messages[14]).toBe("listener2");

      expect(messages[15]).toBe("Calling X.arg1 end");

      expect(typeof meta2).toBe("object");
      expect(K).not.toBe(undefined);
      expect(K).not.toBe(null);
      expect(typeof K).toBe("object");
      if (K) {
        expect(K.isRV).toBe(true);
      }
    });

    it("via counter-wrapping a primitive argument", function () {
      let cbVal: unknown;
      function callback(k: unknown) {
        cbVal = k;
      }

      var x = new ctor1(callback);
      expect(x.arg1).toBe(callback);
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);

      {
        // @ts-ignore - TypeScript will complain that "'Y' is declared but its value is never read". But we still want to do this, since we're testing the side effects of reading 'arg1'.
        let Y = X.arg1; // we've already tested this above
        reset();
        Y = null;
      }

      const Z = true;

      logger.info("Calling X.arg1 start");
      X.arg1(Z);
      logger.info("Calling X.arg1 end");
      expect(cbVal).not.toBe(undefined);

      let messages = appender.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0]).toBe("Calling X.arg1 start");
      expect(messages[1]).toBe("Calling X.arg1 end");

      expect(meta0).toBe(undefined);
      expect(meta1).toBe(undefined);
      expect(meta2).toBe(undefined);
      expect(cbVal).toBe(true);
    });
  });

  describe("can override the proxy to return", function () {
    it("with a primitive", function () {
      var rv = "primitive";
      dryHandler.addProxyListener(function (meta: AllListenerMetadata) {
        meta.proxy = rv;
      });
      var x = new ctor1("one");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      expect(X).toBe(rv);
    });

    it("with a non-primitive", function () {
      var rv = {};
      dryHandler.addProxyListener(function (meta) {
        meta.proxy = rv;
      });
      var x = new ctor1("one");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      expect(X).toBe(rv);
    });

    it("with the unwrapped value, and without Membrane protection", function () {
      var rv = {};
      dryHandler.addProxyListener(function (meta) {
        meta.proxy = meta.target;
      });
      var x = new ctor1(rv);
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      expect(X).toBe(x);

      // If X was wrapped, X.arg1 would also be wrapped, and wouldn't be rv.
      expect(X.arg1).toBe(rv);
    });

    it("with a new proxy built from the existing handler", function () {
      var handler2 = membrane.modifyRules.createChainHandler(dryHandler);
      var extraDesc = {
        value: 3,
        writable: true,
        enumerable: true,
        configurable: true
      };

      handler2.getOwnPropertyDescriptor = function (
        this: IChainHandler,
        target: object,
        propName: string | symbol
      ) {
        if (propName == "extra") {
          return extraDesc;
        }
        return this.nextHandler.getOwnPropertyDescriptor(target, propName);
      };
      dryHandler.addProxyListener(function (meta) {
        handler2.externalHandler;
        meta.handler = handler2;
        meta.rebuildProxy();
      });

      var x = new ctor1("three");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);

      expect(X.extra).toBe(3);
      expect((x as any).extra).toBe(undefined);
    });

    it("with a new proxy built locally", function () {
      /* XXX ajvincent BE EXTREMELY CAREFUL IF YOU EVER DO THIS.  This is like
       * returning an object to override the membrane's handlers... including
       * the membrane being unable to revoke your proxy or provide any membrane
       * properties.  In short, it's a really bad idea.
       *
       * What you _should_ do is demonstrated in the previous test:  create a
       * chain handler, define methods on it, and then call meta.rebuildProxy().
       */

      var extraDesc = {
        value: 3,
        writable: true,
        enumerable: true,
        configurable: true
      };

      var handler2: ProxyHandler<object> = {};
      handler2.getOwnPropertyDescriptor = function (target, propName) {
        if (propName == "extra") {
          return extraDesc;
        }
        return Reflect.getOwnPropertyDescriptor(target, propName);
      };

      function listener(meta: AllListenerMetadata) {
        meta.proxy = new Proxy(meta.target, handler2);
      }

      dryHandler.addProxyListener(listener);

      var x = new ctor1("three");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);

      let XDesc = Reflect.getOwnPropertyDescriptor(X, "extra")!;
      expect(XDesc.value).toBe(3);
      expect((x as any).extra).toBe(undefined);
    });

    /**
     * @note This function here is for testing meta.useShadowTarget.  This test
     * exposes an optimization which replaces the proxy using the
     * heavy-duty ObjectGraphHandler with another proxy using only lightweight
     * methods (and in the case of target functions, the graph handler's .call
     * and .construct methods).
     *
     * For the Object.freeze() and Object.seal() tests, you'll see properties
     * and prototypes looked up at the time of sealing.  For the normal case,
     * those properties will be looked up on demand only.  That's why the
     * "if (mode) { ... } else { ... }" blocks exist:  to distinguish between
     * sealed object tests and lazy getter tests.
     */
    function useShadowTargetTests(mode: UseShadowTargetMode) {
      // begin test infrastructure
      let ctor2 = function (this: ITestObject2, arg1: unknown, arg2: (...args: unknown[]) => void) {
        ctor1.apply(this, [arg1]);
        this.arg2 = arg2;
      } as ITestObject2Constructor;
      ctor2.prototype = new ctor1("ctor2 base");

      let lastLogArg: unknown;
      function logTest(arg: unknown) {
        logger.info("Executing logTest");
        lastLogArg = arg;
      }

      function testListener(meta: AllListenerMetadata) {
        try {
          if ([x, logTest, ctor2, ctor2.prototype, a, b, c].includes(meta.target)) {
            logger.info("starting useShadowTarget");
            meta.useShadowTarget(mode);
            logger.info("finished useShadowTarget");
          }
        } catch (ex) {
          meta.throwException(ex);
        }
      }

      function lazyDescTest(obj: object, propName: string | symbol) {
        const desc = Reflect.getOwnPropertyDescriptor(obj, propName)!;
        const hasGetAndSet = mode !== "prepared" ? "undefined" : "function";
        expect(typeof desc.get).toBe(hasGetAndSet);
        expect(typeof desc.set).toBe(hasGetAndSet);

        let expectation;
        expectation = expect(typeof desc.value);
        if (mode !== "prepared") {
          expectation = expectation.not;
        }
        expectation.toBe("undefined");

        let expectedValue;
        if (mode === "frozen") {
          expectedValue = false;
        } else if (mode === "sealed") {
          expectedValue = true;
        } else {
          expectedValue = undefined;
        }
        expect(desc.writable).toBe(expectedValue);

        expect(desc.enumerable).toBe(true);
        expect(desc.configurable).toBe(mode === "prepared");
      }

      function directDescTest(proxy: object, target: object, propName: string | symbol) {
        let desc = Reflect.getOwnPropertyDescriptor(proxy, propName)!;
        let check = Reflect.getOwnPropertyDescriptor(target, propName)!;
        expect(typeof desc.get).toBe("undefined");
        expect(typeof desc.set).toBe("undefined");
        expect(typeof desc.value).toBe(typeof check.value);

        let expectedValue;
        if (mode === "frozen") {
          expectedValue = false;
        } else {
          expectedValue = true;
        }
        expect(desc.writable).toBe(expectedValue);

        expect(desc.enumerable).toBe(true);
        expect(desc.configurable).toBe(mode === "prepared");
      }
      // end test infrastructure, begin real tests

      dryHandler.addProxyListener(testListener);

      /* Most tests are done with x and X.  I do special cyclic value tests
      with a/b/c, and A/B/C.
      */
      let x: ITestObject2,
        X: ITestObject2,
        a: ITestObject3,
        A: ITestObject3,
        b: ITestObject3,
        B: ITestObject3,
        c: ITestObject3,
        C: ITestObject3;
      {
        x = new ctor2("one", logTest);
        logger.info("x created");

        X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
        logger.info("dry(x) created");

        // Invocation of proxy listeners
        let messages = appender.getMessages();
        if (mode !== "prepared") {
          expect(messages.length).toBe(8);
          expect(messages[0]).toBe("x created");

          // X
          expect(messages[1]).toBe("starting useShadowTarget");

          // Reflect.getPrototypeOf(X)
          expect(messages[2]).toBe("starting useShadowTarget");
          expect(messages[3]).toBe("finished useShadowTarget");

          // X.arg2, also known as logTest
          expect(messages[4]).toBe("starting useShadowTarget");
          expect(messages[5]).toBe("finished useShadowTarget");

          // X
          expect(messages[6]).toBe("finished useShadowTarget");

          expect(messages[7]).toBe("dry(x) created");
        } else {
          expect(messages.length).toBe(6);
          expect(messages[0]).toBe("x created");
          // x
          expect(messages[1]).toBe("starting useShadowTarget");

          // Reflect.getPrototypeOf(X)
          expect(messages[2]).toBe("starting useShadowTarget");
          expect(messages[3]).toBe("finished useShadowTarget");

          // X
          expect(messages[4]).toBe("finished useShadowTarget");
          expect(messages[5]).toBe("dry(x) created");
        }
      }

      appender.clear();
      {
        let keys = Reflect.ownKeys(X).sort();
        expect(keys.length).toBe(3);
        expect(keys[0]).toBe("arg1");
        expect(keys[1]).toBe("arg2");
        expect(keys[2]).toBe("label");
      }

      /* Property descriptors for each property.  Lazy properties will have
       * .get() and .set().  Sealed properties will have .value and .writable.
       */
      ["arg1", "arg2", "label"].forEach(function (key) {
        lazyDescTest(X, key);
      });

      expect(X.arg1).toBe("one");

      // Invoking the lazy getters in the prepared case for arg2.
      {
        appender.clear();
        logger.info("looking up arg2");
        expect(typeof X.arg2).toBe("function");
        logger.info("exiting arg2 lookup");
        let messages = appender.getMessages();

        if (mode !== "prepared") {
          // The lazy getters have already been invoked and discarded.
          expect(messages.length).toBe(2);
          expect(messages[0]).toBe("looking up arg2");
          expect(messages[1]).toBe("exiting arg2 lookup");
        } else {
          // The lazy getters force us into the listener again.
          expect(messages.length).toBe(4);
          expect(messages[0]).toBe("looking up arg2");
          expect(messages[1]).toBe("starting useShadowTarget");
          expect(messages[2]).toBe("finished useShadowTarget");
          expect(messages[3]).toBe("exiting arg2 lookup");
        }
      }

      {
        /* Looking up X.arg2 this time doesn't invoke useShadowTarget, because
         * the lazy getter for arg2 was replaced with a descriptor referring
         * directly to the wrapped method.
         */
        appender.clear();
        logger.info("looking up arg2");
        expect(typeof X.arg2).toBe("function");
        logger.info("exiting arg2 lookup");
        let messages = appender.getMessages();
        expect(messages.length).toBe(2);
        expect(messages[0]).toBe("looking up arg2");
        expect(messages[1]).toBe("exiting arg2 lookup");
      }

      if (typeof X.arg2 === "function") {
        appender.clear();
        X.arg2();
        let messages = appender.getMessages();
        expect(messages.length).toBe(1);
        expect(messages[0]).toBe("Executing logTest");
      }

      expect(X.label).toBe("ctor1 instance");

      // Property descriptors, this time direct instead of lazy.
      ["arg1", "arg2", "label"].forEach(function (key) {
        directDescTest(X, x, key);
      });

      // testing wrapping of arguments:  are we actually invoking call?
      const dryArg = {};
      for (let loop = 0; loop < 2; loop++) {
        appender.clear();
        logger.info("entering logTest with argument");
        X.arg2(dryArg);
        logger.info("leaving logTest with argument");
        let wetArg = membrane.convertArgumentToProxy(dryHandler, wetHandler, dryArg);
        expect(lastLogArg === wetArg).toBe(true);

        let messages = appender.getMessages();
        expect(messages.length).toBe(3);
        expect(messages[0]).toBe("entering logTest with argument");
        expect(messages[1]).toBe("Executing logTest");
        expect(messages[2]).toBe("leaving logTest with argument");
      }

      // disabling the apply trap, so that a function should not be executable
      {
        const funcWrapper = X.arg2;
        const graphName = dryHandler.fieldName;
        expect(typeof graphName).toBe("string");
        membrane.modifyRules.disableTraps(graphName, funcWrapper, ["apply"]);
        appender.clear();
        logger.info("entering logTest with argument");
        expect(function () {
          funcWrapper(dryArg);
        }).toThrow();
        logger.info("leaving logTest with argument");
        let messages = appender.getMessages();
        expect(messages.length).toBe(3);
        expect(messages[0]).toBe("entering logTest with argument");
        expect(messages[1]).toBe("The apply trap is not executable.");
        expect(messages[2]).toBe("leaving logTest with argument");
      }

      // testing the construct trap
      {
        let CTOR2 = membrane.convertArgumentToProxy(wetHandler, dryHandler, ctor2);

        let wetArg = membrane.convertArgumentToProxy(dryHandler, wetHandler, dryArg);

        {
          appender.clear();
          let K = new CTOR2("foo", dryArg);
          let k = membrane.convertArgumentToProxy(dryHandler, wetHandler, K);
          expect(k.arg2 === wetArg).toBe(true);
        }

        // testing disableTraps on a constructor
        membrane.modifyRules.disableTraps(dryHandler.fieldName, CTOR2, ["construct"]);

        expect(function () {
          void new CTOR2();
        }).toThrow();
      }

      // Cyclic object references
      {
        a = { objName: "a" };
        b = { objName: "b" };
        a.child = b;
        b.parent = a;

        A = membrane.convertArgumentToProxy(wetHandler, dryHandler, a);
        B = membrane.convertArgumentToProxy(wetHandler, dryHandler, b);

        expect(A.child!.parent === A).toBe(true);
        expect(B.parent!.child === B).toBe(true);
      }

      // really push the cyclic test a step further, for scalability testing
      {
        a = { objName: "a" };
        b = { objName: "b" };
        c = { objName: "c" };

        a.child = b;
        b.child = c;
        c.grandParent = a;

        A = membrane.convertArgumentToProxy(wetHandler, dryHandler, a);

        B = membrane.convertArgumentToProxy(wetHandler, dryHandler, b);

        C = membrane.convertArgumentToProxy(wetHandler, dryHandler, c);

        expect(A.child!.child!.grandParent === A).toBe(true);
        expect(B.child!.grandParent!.child === B).toBe(true);
        expect(C.grandParent!.child!.child === C).toBe(true);
      }

      /* XXX ajvincent Beyond this point, you should not step through in a
       * debugger.  You will get inconsistent results if you do.
       */

      {
        /* The first time for non-sealed objects, we should invoke the lazy
         * getPrototypeOf call.  For sealed objects, we've already invoked the
         * lazy call when sealing the object.
         */
        appender.clear();
        logger.info("entering getPrototypeOf");
        Reflect.getPrototypeOf(X);
        logger.info("exiting getPrototypeOf");

        let messages = appender.getMessages();
        expect(messages.length).toBe(2);
        expect(messages[0]).toBe("entering getPrototypeOf");
        expect(messages[1]).toBe("exiting getPrototypeOf");
      }

      {
        // The second time, the getPrototypeOf call should be direct.
        appender.clear();
        logger.info("entering getPrototypeOf");
        let Y = Reflect.getPrototypeOf(X);
        logger.info("exiting getPrototypeOf");

        let messages = appender.getMessages();
        expect(messages.length).toBe(2);
        expect(messages[0]).toBe("entering getPrototypeOf");
        expect(messages[1]).toBe("exiting getPrototypeOf");

        appender.clear();

        let expectedY = membrane.convertArgumentToProxy(wetHandler, dryHandler, ctor2.prototype);

        messages = appender.getMessages();
        expect(messages.length).toBe(0);

        expect(Y === expectedY).toBe(true);
      }
    }

    it("a prepared shadow target", useShadowTargetTests.bind(null, "prepared"));
    it("a sealed shadow target", useShadowTargetTests.bind(null, "sealed"));
    it("a frozen shadow target", useShadowTargetTests.bind(null, "frozen"));

    function useShadowWithDefer(objOp: "seal" | "freeze") {
      // begin test infrastructure
      let ctor2 = function (this: ITestObject2, arg1: unknown, arg2: (...args: unknown[]) => void) {
        ctor1.apply(this, [arg1]);
        this.arg2 = arg2;
      } as ITestObject2Constructor;
      ctor2.prototype = new ctor1("ctor2 base");

      function logTest() {
        logger.info("Executing logTest");
      }

      function callObjOp<T extends object>(objOp: "seal" | "freeze", p: T): object {
        switch (objOp) {
          case "seal":
            return Object.seal(p);
          case "freeze":
            return Object.freeze(p);
        }
      }

      function testListener(meta: AllListenerMetadata) {
        try {
          if ([p, logTest, ctor2, ctor2.prototype, a, b, c].includes(meta.target)) {
            logger.info("starting useShadowTarget");
            meta.useShadowTarget("prepared");
            logger.info("finished useShadowTarget");
          }
        } catch (ex) {
          meta.throwException(ex);
        }
      }

      // end test infrastructure, begin real tests

      dryHandler.addProxyListener(testListener);

      // I do special cyclic value tests with a/b/c, and A/B/C.
      let p: ITestObject2,
        P: ITestObject2,
        a: ITestObject3,
        A: ITestObject3,
        b: ITestObject3,
        B: ITestObject3,
        c: ITestObject3,
        C: ITestObject3;
      {
        // repeating earlier conditions
        p = new ctor2("one", logTest);

        appender.clear();

        P = membrane.convertArgumentToProxy(wetHandler, dryHandler, p);

        logger.info(`starting ${objOp}`);
        callObjOp(objOp, P);
        logger.info(`finished ${objOp}`);

        let messages = appender.getMessages();
        expect(messages.length).toBe(8);

        // P
        expect(messages[0]).toBe("starting useShadowTarget");

        // Reflect.getPrototypeOf(P)
        expect(messages[1]).toBe("starting useShadowTarget");
        expect(messages[2]).toBe("finished useShadowTarget");

        // P
        expect(messages[3]).toBe("finished useShadowTarget");
        expect(messages[4]).toBe(`starting ${objOp}`);

        // logtest, aka p.arg2, via Object.seal(P).
        expect(messages[5]).toBe("starting useShadowTarget");
        expect(messages[6]).toBe("finished useShadowTarget");

        expect(messages[7]).toBe(`finished ${objOp}`);

        let desc = Reflect.getOwnPropertyDescriptor(P, "arg2")!;
        expect(desc.configurable).toBe(false);
        expect("value" in desc).toBe(true);
      }

      // Cyclic object references, sealing after initial creation.
      {
        a = { objName: "a" };
        b = { objName: "b" };
        a.child = b;
        b.parent = a;

        A = membrane.convertArgumentToProxy(wetHandler, dryHandler, a);

        callObjOp(objOp, A);

        B = membrane.convertArgumentToProxy(wetHandler, dryHandler, b);

        callObjOp(objOp, B);

        expect(A.child!.parent === A).toBe(true);
        expect(B.parent!.child === B).toBe(true);
      }

      // Cyclic object references, sealing after all proxies' creation.
      {
        a = { objName: "a" };
        b = { objName: "b" };
        a.child = b;
        b.parent = a;

        A = membrane.convertArgumentToProxy(wetHandler, dryHandler, a);

        B = membrane.convertArgumentToProxy(wetHandler, dryHandler, b);

        callObjOp(objOp, A);
        callObjOp(objOp, B);

        expect(A.child!.parent === A).toBe(true);
        expect(B.parent!.child === B).toBe(true);
      }

      // really push the cyclic test a step further, for scalability testing
      {
        a = { objName: "a" };
        b = { objName: "b" };
        c = { objName: "c" };

        a.child = b;
        b.child = c;
        c.grandParent = a;

        A = membrane.convertArgumentToProxy(wetHandler, dryHandler, a);

        B = membrane.convertArgumentToProxy(wetHandler, dryHandler, b);

        C = membrane.convertArgumentToProxy(wetHandler, dryHandler, c);

        callObjOp(objOp, A);
        callObjOp(objOp, B);
        callObjOp(objOp, C);

        expect(A.child!.child!.grandParent === A).toBe(true);
        expect(B.child!.grandParent!.child === B).toBe(true);
        expect(C.grandParent!.child!.child === C).toBe(true);
      }
    }

    it("a prepared shadow target which is later sealed", useShadowWithDefer.bind(null, "seal"));

    it("a prepared shadow target which is later frozen", useShadowWithDefer.bind(null, "freeze"));
  });

  describe("can stop iteration to further listeners", function () {
    let meta1: AllListenerMetadata | undefined, meta2: AllListenerMetadata | undefined;
    beforeEach(function () {
      meta1 = undefined;
      meta2 = undefined;
    });

    it("by invoking meta.stopIteration();", function () {
      function listener1(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }

        meta1 = meta;
        logger.info("listener1: stopped = " + meta.stopped);
        logger.info("listener1: calling meta.stopIteration();");
        meta.stopIteration();
        logger.info("listener1: stopped = " + meta.stopped);
      }

      function listener2(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }

        meta2 = meta;
        logger.info("listener2: stopped = " + meta.stopped);
        logger.info("listener2: calling meta.stopIteration();");
        meta.stopIteration();
        logger.info("listener2: stopped = " + meta.stopped);
      }

      dryHandler.addProxyListener(listener1);
      dryHandler.addProxyListener(listener2);

      var x = new ctor1("one");
      logger.info("x created");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      logger.info("dry(x) created");
      expect(X.label).toBe("ctor1 instance");
      expect(X).not.toBe(x);

      let messages = appender.getMessages();
      expect(messages.length).toBe(5);
      expect(messages[0]).toBe("x created");
      expect(messages[1]).toBe("listener1: stopped = false");
      expect(messages[2]).toBe("listener1: calling meta.stopIteration();");
      expect(messages[3]).toBe("listener1: stopped = true");
      expect(messages[4]).toBe("dry(x) created");

      expect(meta2).toBe(undefined);
      expect(typeof meta1).toBe("object");
      expect(meta1!.proxy).toBe(X);
      expect(meta1!.stopped).toBe(true);
    });

    it("by invoking meta.throwException(exn);", function () {
      const dummyExn = new Error();
      function listener1(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }

        meta1 = meta;
        logger.info("listener1: stopped = " + meta.stopped);
        logger.info("listener1: calling meta.throwException(exn1);");
        meta.throwException(dummyExn);
        logger.info("listener1: stopped = " + meta.stopped);
      }

      function listener2(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }

        meta2 = meta;
        logger.info("listener2: stopped = " + meta.stopped);
        logger.info("listener2: calling meta.stopIteration();");
        meta.stopIteration();
        logger.info("listener2: stopped = " + meta.stopped);
      }

      dryHandler.addProxyListener(listener1);
      dryHandler.addProxyListener(listener2);

      var x = new ctor1("one");
      logger.info("x created");
      expect(function () {
        membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      }).toThrow(dummyExn);
      logger.info("dry(x) threw");

      let messages = appender.getMessages();
      expect(messages.length).toBe(5);
      expect(messages[0]).toBe("x created");
      expect(messages[1]).toBe("listener1: stopped = false");
      expect(messages[2]).toBe("listener1: calling meta.throwException(exn1);");
      expect(messages[3]).toBe("listener1: stopped = true");
      expect(messages[4]).toBe("dry(x) threw");

      expect(meta2).toBe(undefined);
      expect(typeof meta1).toBe("object");
      expect(meta1!.stopped).toBe(true);
    });

    it("but not by accidentally triggering an exception", function () {
      const dummyExn = new Error("dummy exception");
      function listener1(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }
        meta1 = meta;
        logger.info("listener1: stopped = " + meta.stopped);
        throw dummyExn; // this is supposed to be an accident
      }

      function listener2(meta: AllListenerMetadata) {
        if (mustSkip(meta.target)) {
          return;
        }
        meta2 = meta;
        logger.info("listener2: stopped = " + meta.stopped);
      }

      dryHandler.addProxyListener(listener1);
      dryHandler.addProxyListener(listener2);

      var x = new ctor1("one");
      logger.info("x created");
      var X = membrane.convertArgumentToProxy(wetHandler, dryHandler, x);
      logger.info("dry(x) created");
      expect(X.label).toBe("ctor1 instance");
      expect(X).not.toBe(x);

      let messages = appender.getMessages();
      expect(messages.length).toBe(5);
      expect(messages[0]).toBe("x created");
      expect(messages[1]).toBe("listener1: stopped = false");
      expect(messages[2]).toBe("dummy exception");
      expect(messages[3]).toBe("listener2: stopped = false");
      expect(messages[4]).toBe("dry(x) created");

      expect(meta2).toBe(meta1);
      expect(typeof meta2).toBe("object");
      expect(meta2!.proxy).toBe(X);
    });
  });
});
