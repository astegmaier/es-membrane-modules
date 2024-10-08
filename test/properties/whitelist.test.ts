import { MembraneMocks } from "../../mocks";
import {
  AllListenerMetadata,
  DistortionListenerCategory,
  DistortionsListener,
  DistortionsListenerValue,
  Membrane,
  OwnKeysFilter
} from "../../src";
import type {
  IDocument,
  IEvent,
  IListener,
  IMockEventTarget,
  IMockOptions,
  IMocks
} from "../../mocks";

type Filter = (element: string | symbol) => boolean;

interface INameFilters {
  doc: Filter;
  listener: Filter;
  target: Filter;
  node: Filter;
  element: Filter;
  proto: {
    function: Filter;
    node: Filter;
    element: Filter;
  };
}

interface IMockOptionsWithCheckEvent extends IMockOptions<IMocks> {
  checkEvent: ((this: IMockEventTarget, event: IEvent) => void) | null;
}

interface IMockOptionsManual extends IMockOptionsWithCheckEvent {
  whitelist: (meta: AllListenerMetadata, filter: Filter, field?: string) => void;
}

interface IMockOptionsByDistortionsListener extends IMockOptionsWithCheckEvent {
  whitelist: (
    distortions: DistortionsListener,
    value: DistortionsListenerValue,
    filteredOwnKeys: boolean | OwnKeysFilter,
    category: DistortionListenerCategory
  ) => void;
  whitelistMain: (distortions: DistortionsListener) => void;
}

describe("Whitelisting object properties", function () {
  let wetDocument: IDocument, dryDocument: IDocument;

  function HEAT() {
    return "handleEventAtTarget stub";
  }
  function HEAT_NEW() {
    return "Hello World";
  }

  /* These lists specify properties defined on the objects.  For instance,
   * childNodes is defined in NodeWhiteList because every parts.wet.Node object
   * has a childNodes property.
   */

  const EventListenerWetWhiteList = ["handleEvent"];

  const EventTargetWhiteList = ["addEventListener", "dispatchEvent"];

  const NodeWhiteList = ["childNodes", "parentNode"];

  const NodeProtoWhiteList = ["insertBefore", "firstChild"];

  const ElementWhiteList = [
    "nodeType",
    "nodeName",
    // ansteg: I added this when I converted the test mocks to ES6 classes,
    // which work slightly differently than the manually-rolled prototype inheritance we were using before.
    // Specifically when a class inherits from another one the base classes "own" props that are set in the constructor
    // end up on the same instance object, whereas before they would be on the inherited prototype object.
    "parentNode"
  ];

  const docWhiteList = [
    "ownerDocument",
    "childNodes",
    "nodeType",
    "nodeName",
    "parentNode",
    "createElement",
    "insertBefore",
    "firstChild",
    "baseURL",
    "addEventListener",
    "dispatchEvent",
    "rootElement"
  ];

  function defineManualMockOptions(): IMockOptionsManual {
    function buildFilter(names: (string | symbol)[], prevFilter?: Filter): Filter {
      return function (elem) {
        if (prevFilter && prevFilter(elem)) {
          return true;
        }
        return names.includes(elem);
      };
    }

    const nameFilters = {} as INameFilters;
    nameFilters.doc = buildFilter(docWhiteList);
    nameFilters.listener = buildFilter(EventListenerWetWhiteList);
    nameFilters.target = buildFilter(EventTargetWhiteList);
    nameFilters.node = buildFilter(NodeWhiteList, nameFilters.target);
    nameFilters.element = buildFilter(ElementWhiteList, nameFilters.node);

    nameFilters.proto = {} as INameFilters["proto"];
    nameFilters.proto.node = buildFilter(NodeProtoWhiteList, nameFilters.target);
    nameFilters.proto.element = buildFilter([], nameFilters.proto.node);

    var parts: IMocks, dryWetMB: Membrane, EventListenerProto: IMockEventTarget;
    const mockOptions: IMockOptionsManual = {
      checkEvent: null,

      whitelist: function (meta: AllListenerMetadata, filter: Filter, field = "wet") {
        dryWetMB.modifyRules.storeUnknownAsLocal(field, meta.target);
        dryWetMB.modifyRules.requireLocalDelete(field, meta.target);
        dryWetMB.modifyRules.filterOwnKeys(field, meta.target, filter);
        meta.stopIteration();
      },

      wetHandlerCreated: function (handler, Mocks) {
        parts = Mocks;
        dryWetMB = parts.membrane;
        EventListenerProto = Object.getPrototypeOf(parts.wet.Node.prototype);

        {
          let oldHandleEvent = EventListenerProto.handleEventAtTarget;
          EventListenerProto.handleEventAtTarget = function (/*event*/) {
            if (mockOptions.checkEvent) {
              mockOptions.checkEvent.apply(this, arguments as any);
            }
            return oldHandleEvent.apply(this, arguments as any);
          };
          parts.wet.doc.handleEventAtTarget = EventListenerProto.handleEventAtTarget;
        }

        /**
         * This is a proxy listener for protecting the listener argument of
         * EventTargetWet.prototype.addEventListener().
         */
        const listener = function (this: IMockOptionsManual, meta: any) {
          if (
            meta.callable !== EventListenerProto.addEventListener ||
            meta.trapName !== "apply" ||
            meta.argIndex !== 1
          ) {
            return;
          }

          if (typeof meta.target == "function") {
            return;
          }

          if (typeof meta.target != "object" || meta.target === null) {
            meta.throwException(
              new Error(".addEventListener requires listener be an object or a function!")
            );
          }

          try {
            this.whitelist(meta, nameFilters.listener, "dry");
          } catch (ex) {
            meta.throwException(ex);
          }
        }.bind(this);
        handler.addProxyListener(listener);
      },

      dryHandlerCreated: function (handler /*, Mocks */) {
        /**
         * This is a long sequence of tests, matching the constructed target
         * to the whitelist to apply.  It's a little more complicated than I
         * would like, but for a manual test, it works well enough.
         */
        var listener = function (this: IMockOptionsManual, meta: any) {
          if (meta.target === parts.wet.doc) {
            // parts.dry.doc will be meta.proxy.
            this.whitelist(meta, nameFilters.doc);
            return;
          }
          if (meta.target instanceof parts.wet.Element) {
            // parts.dry.Element will be meta.proxy or in the prototype chain.
            this.whitelist(meta, nameFilters.element);
            return;
          }

          if (meta.target instanceof parts.wet.Node) {
            // parts.dry.Node will be meta.proxy.
            this.whitelist(meta, nameFilters.node);
            return;
          }

          if (meta.target === parts.wet.Element) {
            this.whitelist(meta, nameFilters.proto.element);
            return;
          }

          if (meta.target === parts.wet.Node) {
            this.whitelist(meta, nameFilters.proto.node);
            return;
          }

          if (meta.target === parts.wet.Node.prototype) {
            this.whitelist(meta, nameFilters.proto.node);
            return;
          }

          if (meta.target === EventListenerProto) {
            this.whitelist(meta, nameFilters.target);
            return;
          }
        }.bind(this);

        handler.addProxyListener(listener);
      }
    };

    return mockOptions;
  }

  function defineMockOptionsByDistortionsListener(mainIsWet = false) {
    let parts: IMocks, dryWetMB: Membrane, EventListenerProto: IMockEventTarget;
    const mockOptions: IMockOptionsByDistortionsListener = {
      checkEvent: null,

      wetHandlerCreated: function (handler, Mocks) {
        parts = Mocks;
        dryWetMB = parts.membrane;
        EventListenerProto = Object.getPrototypeOf(parts.wet.Node.prototype);

        const distortions = dryWetMB.modifyRules.createDistortionsListener();
        {
          let oldHandleEvent = EventListenerProto.handleEventAtTarget;
          EventListenerProto.handleEventAtTarget = function (/*event*/) {
            if (mockOptions.checkEvent) {
              mockOptions.checkEvent.apply(this, arguments as any);
            }
            return oldHandleEvent.apply(this, arguments as any);
          };
          parts.wet.doc.handleEventAtTarget = EventListenerProto.handleEventAtTarget;
        }

        /**
         * This is a proxy listener for protecting the listener argument of
         * EventTargetWet.prototype.addEventListener().
         */

        const evLConfig = distortions.sampleConfig();
        evLConfig.filterOwnKeys = EventListenerWetWhiteList;
        evLConfig.storeUnknownAsLocal = true;
        evLConfig.requireLocalDelete = true;

        const evLFilter = function (this: IMockOptionsByDistortionsListener, meta: any) {
          if (
            meta.callable !== EventListenerProto.addEventListener ||
            meta.trapName !== "apply" ||
            meta.argIndex !== 1
          ) {
            return false;
          }

          if (typeof meta.target == "function") {
            return false;
          }

          if (typeof meta.target != "object" || meta.target === null) {
            meta.throwException(
              new Error(".addEventListener requires listener be an object or a function!")
            );
            return false;
          }

          return true;
        };

        distortions.addListener(evLFilter, "filter", evLConfig);

        if (mainIsWet) {
          this.whitelistMain(distortions);
        }

        distortions.bindToHandler(handler);
      },

      whitelist: function (distortions, value, filteredOwnKeys, category) {
        const config = distortions.sampleConfig();
        config.filterOwnKeys = filteredOwnKeys;
        config.storeUnknownAsLocal = true;
        config.requireLocalDelete = true;
        distortions.addListener(value, category, config);
      },

      dryHandlerCreated: function (handler /*, Mocks */) {
        if (mainIsWet) {
          return;
        }
        const distortions = dryWetMB.modifyRules.createDistortionsListener();
        this.whitelistMain(distortions);
        distortions.bindToHandler(handler);
      },

      whitelistMain: function (distortions) {
        this.whitelist(distortions, parts.wet.doc, docWhiteList, "value");
        this.whitelist(distortions, parts.wet.Element, ElementWhiteList, "instance");
        this.whitelist(distortions, parts.wet.Node, NodeWhiteList, "instance");
        this.whitelist(distortions, parts.wet.Element, [], "value");
        this.whitelist(distortions, parts.wet.Node, NodeProtoWhiteList, "value");
        this.whitelist(distortions, parts.wet.Node, NodeProtoWhiteList, "prototype");
        this.whitelist(distortions, EventListenerProto, EventTargetWhiteList, "value");
      }
    };

    return mockOptions;
  }

  function defineWhitelistTests(mockDefine: () => IMockOptionsWithCheckEvent) {
    let parts: IMocks, mockOptions: IMockOptionsWithCheckEvent;
    beforeEach(function () {
      mockOptions = mockDefine();
      parts = MembraneMocks(false, null, mockOptions);
      wetDocument = parts.wet.doc;
      dryDocument = parts.dry.doc;
    });

    afterEach(function () {
      dryDocument.dispatchEvent("unload");
      dryDocument = null as any;
      wetDocument = null as any;
      mockOptions.checkEvent = null as any;
      mockOptions = null as any;
    });

    it("exposes listed values.", function () {
      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "nodeName");
      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "nodeName");
      expect(typeof descWet).not.toBe(undefined);
      expect(typeof descDry).not.toBe(undefined);
      if (descWet && descDry) {
        expect(descWet.value).toBe("#document");
        expect(descDry.value).toBe("#document");
      }
    });

    it("hides unlisted values.", function () {
      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");
      expect(descWet).not.toBe(undefined);
      expect(typeof descWet!.value).toBe("function");
      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "handleEventAtTarget");
      expect(descDry).toBe(undefined);
    });

    it("and redefining a not-whitelisted property on the wet document has no effect on the dry document.", function () {
      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");

      Reflect.defineProperty(wetDocument, "handleEventAtTarget", {
        value: HEAT,
        writable: false,
        enumerable: true,
        configurable: true
      });

      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "handleEventAtTarget");
      expect(descDry).toBe(undefined);

      expect(descWet).toBeDefined();
      Reflect.defineProperty(wetDocument, "handleEventAtTarget", descWet!);
    });

    it("and defining a not-whitelisted property on the dry document has no effect on the wet document.", function () {
      var oldDescWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");

      const isDryExtensible = Reflect.isExtensible(dryDocument);
      var defined = Reflect.defineProperty(dryDocument, "handleEventAtTarget", {
        value: HEAT_NEW,
        writable: false,
        enumerable: true,
        configurable: true
      });
      expect(defined).toBe(isDryExtensible);

      var descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");
      expect(descWet).not.toBe(undefined);
      if (descWet) {
        expect(descWet.value).toBe(oldDescWet!.value);
      }

      var descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "handleEventAtTarget");
      let expectation = isDryExtensible ? expect(descDry).not : expect(descDry);
      expectation.toBe(undefined);
      if (descDry) {
        expect(descDry.value).toBe(HEAT_NEW);
      }
    });

    it("and deleting a not-whitelisted property on the dry document has no effect on the wet document.", function () {
      var oldDescWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");

      Reflect.defineProperty(dryDocument, "handleEventAtTarget", {
        value: HEAT_NEW,
        writable: false,
        enumerable: true,
        configurable: true
      });

      var deleted = Reflect.deleteProperty(dryDocument, "handleEventAtTarget");
      expect(deleted).toBe(true);

      var descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "handleEventAtTarget");
      expect(descWet).not.toBe(undefined);
      if (descWet) {
        expect(descWet.value).toBe(oldDescWet!.value);
      }

      var descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "handleEventAtTarget");
      expect(descDry).toBe(undefined);
    });

    it("and defining a new property on the dry document has no effect on the wet document.", function () {
      const isDryExtensible = Reflect.isExtensible(dryDocument);
      let defined = Reflect.defineProperty(dryDocument, "extra", {
        value: 2,
        writable: false,
        enumerable: true,
        configurable: true
      });
      expect(defined).toBe(isDryExtensible);

      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "extra");
      expect(descWet).toBe(undefined);

      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "extra");
      let expectation = isDryExtensible ? expect(descDry).not : expect(descDry);
      expectation.toBe(undefined);
      if (descDry) {
        expect(descDry.value).toBe(2);
      }
    });

    it("and deleting a new property on the dry document has no effect on the wet document.", function () {
      Reflect.defineProperty(dryDocument, "extra", {
        value: 2,
        writable: false,
        enumerable: true,
        configurable: true
      });
      let deleted = Reflect.deleteProperty(dryDocument, "extra");
      expect(deleted).toBe(true);

      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "extra");
      expect(descWet).toBe(undefined);

      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "extra");
      expect(descDry).toBe(undefined);
    });

    it("and defining a new property on the wet document has no effect on the dry document.", function () {
      const isWetExtensible = Reflect.isExtensible(wetDocument);
      let defined = Reflect.defineProperty(wetDocument, "extra", {
        value: 2,
        writable: false,
        enumerable: true,
        configurable: true
      });
      expect(defined).toBe(isWetExtensible);

      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "extra");
      let expectation = isWetExtensible ? expect(descWet).not : expect(descWet);
      expectation.toBe(undefined);
      if (descWet) {
        expect(descWet.value).toBe(2);
      }

      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "extra");
      expect(descDry).toBe(undefined);
    });

    it("and deleting a new property on the wet document has no effect on the dry document.", function () {
      Reflect.defineProperty(wetDocument, "extra", {
        value: 2,
        writable: false,
        enumerable: true,
        configurable: true
      });

      let deleted = Reflect.deleteProperty(wetDocument, "extra");
      expect(deleted).toBe(true);

      let descWet = Reflect.getOwnPropertyDescriptor(wetDocument, "extra");
      expect(descWet).toBe(undefined);

      let descDry = Reflect.getOwnPropertyDescriptor(dryDocument, "extra");
      expect(descDry).toBe(undefined);
    });

    it("applies similarly to inherited names.", function () {
      // Whitelisting applies similarly to inherited names.
      let dryRoot = dryDocument.rootElement;
      expect(dryRoot).not.toBe(wetDocument.rootElement);
      dryDocument.insertBefore(dryRoot, null);

      // ElementWet constructor tests.
      expect(dryRoot.nodeName).toBe("root");
      expect(dryRoot.nodeType).toBe(1);

      // NodeWet constructor tests.
      {
        let kids = dryRoot.childNodes;
        let isArray = Array.isArray(kids);
        if (isArray) {
          expect(kids.length).toBe(0);
        }
      }

      /* This doesn't appear because it's not whitelisted under the
       * "instanceof parts.wet.Element" test.  Specifically, it's not part of
       * NodeWhiteList or ElementWhiteList.
       */
      expect(dryRoot.ownerDocument).toBe(undefined);

      expect(dryRoot.parentNode).not.toBe(undefined);
      expect(typeof dryRoot.wetMarker).toBe("undefined");

      // NodeWet.prototype tests
      expect(typeof dryRoot.insertBefore).toBe("function");
      expect(typeof dryRoot.shouldNotBeAmongKeys).toBe("undefined");

      // EventListenerWet tests
      expect(typeof dryRoot.__events__).toBe("undefined");

      // EventListenerWet.prototype tests
      expect(typeof dryRoot.addEventListener).toBe("function");
      expect(typeof dryRoot.dispatchEvent).toBe("function");
      expect(typeof dryRoot.handleEventAtTarget).toBe("undefined");
    });

    it("of method arguments goes both ways.", function () {
      interface IAugmentedEvent extends IEvent {
        thisObj: object;
      }
      let event = null as null | IAugmentedEvent;

      /* Testing a handleEvent function added as a method.

         We're also testing the white-listing of method arguments by the
         checkEvent function, inspecting a proxied event listener object and
         verifying that basic whitelisting of the arguments, specified manually,
         also works.  The listener object, for instance, is supposed to have
         only one property, the handleEvent() function.  Anything else is
         foreign, and the "trusted" wet code should NOT be able to propagate
         setting or deleting properties to the dry listeners that were passed in.
      */

      interface IAugmentedListener extends IListener {
        didFire?: boolean;
        foo?: number;
      }

      let listener: IAugmentedListener = {
        handleEvent: function (evt: IEvent) {
          event = { ...evt, thisObj: this };
        },
        didFire: false
      };

      dryDocument.addEventListener("asMethod", listener, false);
      dryDocument.insertBefore(dryDocument.rootElement, null);

      mockOptions.checkEvent = function (event) {
        let handlers = this.__events__.slice(0);
        let length = handlers.length;
        let desired = null as null | IAugmentedListener;
        for (let i = 0; i < length; i++) {
          let h = handlers[i]!;
          if (h.type !== event.type) {
            continue;
          }
          let hCode = h.isBubbling ? 4 - event.currentPhase : event.currentPhase;
          if (hCode === 3) {
            continue;
          }

          expect(desired).toBe(null);
          desired = h.listener;
        }

        // desired should be a proxy to listener.
        expect(desired).not.toBe(listener);
        expect(desired).not.toBe(null);
        if (desired === null) {
          return;
        }

        let keys = Reflect.ownKeys(desired);

        expect(keys.includes("handleEvent")).toBe(true);
        expect(keys.includes("didFire")).toBe(false);

        desired.foo = 3;
        expect(typeof listener.foo).toBe("undefined");
        {
          let desc = Reflect.getOwnPropertyDescriptor(desired, "foo");
          expect(desc).not.toBe(undefined);
          if (desc) {
            expect(desc.value).toBe(3);
          }
        }

        desired.didFire = true;
        expect(listener.didFire).toBe(false);

        listener.didFire = true;
        mockOptions.checkEvent = null;
      };

      dryDocument.rootElement.dispatchEvent("asMethod");
      mockOptions.checkEvent = null;
      expect(listener.didFire).toBe(true);

      expect(event).not.toBe(null);
      if (event) {
        expect(event.type).toBe("asMethod");
        expect(event.currentPhase).toBe(1);
        expect(event.thisObj).toBe(listener);
      }
    });
  }

  function defineSealingTests(mockDefine: () => IMockOptionsWithCheckEvent) {
    describe("on unsealed objects", function () {
      defineWhitelistTests(mockDefine);
    });

    describe("on sealed dry objects", function () {
      defineWhitelistTests(mockDefine);
      beforeEach(function () {
        Object.seal(dryDocument);
      });
    });

    describe("on sealed wet objects", function () {
      defineWhitelistTests(mockDefine);
      beforeEach(function () {
        Object.seal(wetDocument);
      });
    });

    describe("on frozen dry objects", function () {
      defineWhitelistTests(mockDefine);
      beforeEach(function () {
        Object.freeze(dryDocument);
      });
    });

    describe("on frozen wet objects", function () {
      defineWhitelistTests(mockDefine);
      beforeEach(function () {
        Object.freeze(wetDocument);
      });
    });
  }

  describe("manually", function () {
    defineSealingTests(defineManualMockOptions);
  });

  describe("automatically using distortions listeners on two object graphs", function () {
    defineSealingTests(defineMockOptionsByDistortionsListener.bind(null, false));
  });

  describe("automatically using distortions listeners on one object graph", function () {
    defineSealingTests(defineMockOptionsByDistortionsListener.bind(null, true));
  });

  it("and getting a handler from a protected membrane works correctly", function () {
    function voidFunc() {}

    const DogfoodLogger = {
      _errorList: [] as string[],
      error: function (e: string) {
        this._errorList.push(e);
      },
      warn: voidFunc,
      info: voidFunc,
      debug: voidFunc,
      trace: voidFunc,
      fatal: voidFunc,
      log: voidFunc,

      getFirstError: function () {
        return this._errorList.length ? this._errorList[0] : undefined;
      }
    };
    const Dogfood = new Membrane({ logger: DogfoodLogger });

    const publicAPI = Dogfood.getHandlerByName("public", { mustCreate: true });
    const internalAPI = Dogfood.getHandlerByName("internal", { mustCreate: true });

    // lockdown of the public API here
    const mbListener = {
      mustProxyMethods: new Set(),

      whitelist: function (
        meta: AllListenerMetadata,
        names: (string | symbol)[],
        field = "internal"
      ) {
        if (typeof meta.target === "function") {
          names = names.concat(["prototype", "length", "name"]);
        }

        const namesSet = new Set(names);
        Dogfood.modifyRules.storeUnknownAsLocal(field, meta.target);
        Dogfood.modifyRules.requireLocalDelete(field, meta.target);
        Dogfood.modifyRules.filterOwnKeys(field, meta.target, namesSet.has.bind(namesSet));
        meta.stopIteration();
      },

      handleProxy: function (meta: AllListenerMetadata) {
        if (meta.target instanceof Membrane) {
          this.whitelist(meta, ["modifyRules", "logger"]);
        } else if (meta.target === Membrane) {
          this.whitelist(meta, []);
        } else if (meta.target === Membrane.prototype) {
          this.whitelist(meta, [
            "hasHandlerByField",
            "getHandlerByName",
            "convertArgumentToProxy",
            "warnOnce"
          ]);
        } else if (!this.mustProxyMethods.has(meta.target)) {
          meta.proxy = meta.target;
        }
      }
    };

    {
      let keys = Reflect.ownKeys(Membrane.prototype) as [keyof Membrane];
      keys.forEach(function (propName) {
        let value = Membrane.prototype[propName];
        if (typeof value == "function") {
          mbListener.mustProxyMethods.add(value);
        }
      });
    }

    Object.freeze(mbListener);
    publicAPI.addProxyListener(mbListener.handleProxy.bind(mbListener));

    const DMembrane = Dogfood.convertArgumentToProxy(internalAPI, publicAPI, Membrane);

    expect(function () {
      const dryWetMB = new DMembrane();
      dryWetMB.getHandlerByName("wet", { mustCreate: true });
    }).not.toThrow();
    expect(DogfoodLogger.getFirstError()).toBe(undefined);
  });
});
