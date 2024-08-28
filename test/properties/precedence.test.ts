import { MembraneMocks } from "../../mocks";
import type { IDocument, IMocks } from "../../mocks";
import type { Membrane } from "../../src";

describe("storeUnknownAsLocal overrides filterOwnKeys for .defineProperty()", function () {
  function BlacklistFilter(name: string | symbol) {
    switch (name) {
      case "__events__":
      case "handleEventAtTarget":
      case "shouldNotBeAmongKeys":
      case "blacklisted":
        return false;
    }
    return true;
  }

  const desc1 = {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true
  };

  const desc2 = {
    value: 2,
    writable: true,
    enumerable: true,
    configurable: false
  };

  let parts: IMocks, dryDocument: IDocument, wetDocument: IDocument, membrane: Membrane;

  beforeEach(function () {
    parts = MembraneMocks(false);
    dryDocument = parts.dry.doc;
    wetDocument = parts.wet.doc;
    membrane = parts.membrane;
  });

  afterEach(function () {
    dryDocument = null as any;
    wetDocument = null as any;

    membrane.getHandlerByName("dry").revokeEverything();
    membrane = null as any;
    parts = null as any;
  });

  function runTest(propName: string, wetValue: unknown) {
    {
      let keys = Reflect.ownKeys(dryDocument);
      expect(keys.includes(propName)).toBe(true);
    }

    {
      let desc = Reflect.getOwnPropertyDescriptor(dryDocument, propName);
      expect(desc).not.toBe(undefined);
      if (desc) {
        expect(desc.value).toBe(1);
      }
    }

    {
      let desc = Reflect.getOwnPropertyDescriptor(wetDocument, propName);
      if (desc) {
        desc = desc.value;
      }
      expect(desc).toBe(wetValue);
    }
  }

  function buildTest(storeUnknown: "dry" | "wet", filterKeys: "dry" | "wet", propName: string) {
    return [
      // description
      [
        "with storeUnknownAsLocal on the " + storeUnknown + " graph",
        "filterOwnKeys on the " + filterKeys + " graph",
        "and the property name of " + propName
      ].join(", "),

      function () {
        membrane.modifyRules.filterOwnKeys(filterKeys, parts[filterKeys].doc, BlacklistFilter);
        membrane.modifyRules.storeUnknownAsLocal(storeUnknown, parts[storeUnknown].doc);

        /* Define the property on the dry graph.  It should appear on the dry graph
         * but not on the wet graph.
         */
        expect(Reflect.defineProperty(dryDocument, propName, desc1)).toBe(true);

        runTest(propName, undefined);

        /* Define the property with a different value on the wet graph.  The dry
         * graph should be unaffected.
         */
        expect(Reflect.defineProperty(wetDocument, propName, desc2)).toBe(true);

        runTest(propName, 2);
      }
    ] as const;
  }

  /* Combinations:
       storeUnknownAsLocal: dry, wet
       filterOwnKeys: dry, wet
       property name: extra, blacklisted
    */
  (["dry", "wet"] as const).forEach(function (storeUnknown) {
    (["dry", "wet"] as const).forEach(function (filterOwn) {
      ["extra", "blacklisted"].forEach(function (propName) {
        var [desc, test] = buildTest(storeUnknown, filterOwn, propName);
        it(desc, test);
      });
    });
  });
});

describe("requireLocalDelete overrides filterOwnKeys for .deleteProperty()", function () {
  function BlacklistFilter(name: string | symbol) {
    switch (name) {
      case "__events__":
      case "handleEventAtTarget":
      case "shouldNotBeAmongKeys":
      case "blacklisted":
        return false;
    }
    return true;
  }

  const desc2 = {
    value: 2,
    writable: true,
    enumerable: true,
    configurable: false
  };

  var parts: IMocks, dryDocument: IDocument, wetDocument: IDocument, membrane: Membrane;

  beforeEach(function () {
    parts = MembraneMocks(false);
    dryDocument = parts.dry.doc;
    wetDocument = parts.wet.doc;
    membrane = parts.membrane;
  });

  afterEach(function () {
    dryDocument = null as any;
    wetDocument = null as any;

    membrane.getHandlerByName("dry").revokeEverything();
    membrane = null as any;
    parts = null as any;
  });

  function runTest(propName: string, wetValue: unknown) {
    {
      let keys = Reflect.ownKeys(dryDocument);
      expect(keys.includes(propName)).toBe(false);
    }

    {
      let desc = Reflect.getOwnPropertyDescriptor(dryDocument, propName);
      expect(desc).toBe(undefined);
    }

    {
      let desc = Reflect.getOwnPropertyDescriptor(wetDocument, propName);
      if (desc) {
        desc = desc.value;
      }
      expect(desc).toBe(wetValue);
    }
  }

  function buildTest(requireLocal: "dry" | "wet", filterKeys: "dry" | "wet", propName: string) {
    return [
      // description
      [
        "with requireLocalDelete on the " + requireLocal + " graph",
        "filterOwnKeys on the " + filterKeys + " graph",
        "and the property name of " + propName
      ].join(", "),

      function () {
        membrane.modifyRules.filterOwnKeys(filterKeys, parts[filterKeys].doc, BlacklistFilter);
        membrane.modifyRules.requireLocalDelete(requireLocal, parts[requireLocal].doc);

        var oldValue = Reflect.get(wetDocument, propName);

        /* Delete the property on the dry graph.  It should be removed from the dry graph
         * but not on the wet graph.
         */
        expect(Reflect.deleteProperty(dryDocument, propName)).toBe(true);

        runTest(propName, oldValue);

        /* Define the property with a different value on the wet graph.  The dry
         * graph should be unaffected.
         */
        expect(Reflect.defineProperty(wetDocument, propName, desc2)).toBe(true);

        runTest(propName, 2);
      }
    ] as const;
  }

  /* Combinations:
       requireLocalDelete: dry, wet
       filterOwnKeys: dry, wet
       property name: nodeName, blacklisted
    */
  (["dry", "wet"] as const).forEach(function (storeUnknown) {
    (["dry", "wet"] as const).forEach(function (filterOwn) {
      ["nodeName", "blacklisted"].forEach(function (propName) {
        var [desc, test] = buildTest(storeUnknown, filterOwn, propName);
        it(desc, test);
      });
    });
  });
});
