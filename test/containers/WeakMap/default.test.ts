import { Membrane } from "../../../src";
import type { ObjectGraphHandler } from "../../../src";

it("WeakMap instances by default in a membrane work like they do without a membrane", function () {
  "use strict";

  let membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    dampHandler: ObjectGraphHandler,
    wetMap: WeakMap<object, unknown>,
    dryMap: WeakMap<object, unknown>,
    dampMap: WeakMap<object, unknown>;
  {
    const MUSTCREATE = Object.freeze({ mustCreate: true });
    membrane = new Membrane();
    wetHandler = membrane.getHandlerByName("wet", MUSTCREATE);
    dryHandler = membrane.getHandlerByName("dry", MUSTCREATE);
    dampHandler = membrane.getHandlerByName("damp", MUSTCREATE);

    wetMap = new WeakMap();
    dryMap = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetMap);
    // we rarely create proxies this way in our tests, so this'll be useful
    dampMap! = membrane.convertArgumentToProxy(dryHandler, dampHandler, dryMap);
  }

  function checkMap(
    map: WeakMap<object, unknown>,
    keys: object[],
    values: unknown[],
    shouldHave = true
  ) {
    keys.forEach(function (key, index) {
      const value = values[index];
      expect(map.has(key)).toBe(shouldHave);
      expect(map.get(key)).toBe(shouldHave ? value : undefined);
    });
  }

  const dryKey1 = {},
    dryValue1 = {},
    dryKey2 = {},
    dryValue2 = {};
  dryMap.set(dryKey1, dryValue1);
  checkMap(dryMap, [dryKey1], [dryValue1], true);
  checkMap(dryMap, [dryKey2], [dryValue2], false);

  const wetKey1 = {},
    wetValue1 = {};
  wetMap.set(wetKey1, wetValue1);
  checkMap(dryMap, [dryKey1], [dryValue1], true);
  checkMap(dryMap, [dryKey2], [dryValue2], false);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  dryMap.set(dryKey2, dryValue2);
  checkMap(dryMap, [dryKey1, dryKey2], [dryValue1, dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  // deleting a key it doesn't have
  dryMap.delete(dryValue1);
  checkMap(dryMap, [dryKey1, dryKey2], [dryValue1, dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  dryMap.delete(dryKey1);
  checkMap(dryMap, [dryKey1], [dryValue1], false);
  checkMap(dryMap, [dryKey2], [dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);
});
