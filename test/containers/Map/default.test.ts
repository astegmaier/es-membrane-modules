import { Membrane } from "../../../src";
import type { ObjectGraphHandler } from "../../../src";

it("Map instances by default in a membrane work like they do without a membrane", function () {
  "use strict";

  let membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    dampHandler: ObjectGraphHandler,
    wetMap: Map<unknown, unknown>,
    dryMap: Map<unknown, unknown>,
    dampMap: Map<unknown, unknown>;
  {
    const MUSTCREATE = Object.freeze({ mustCreate: true });
    membrane = new Membrane();
    wetHandler = membrane.getHandlerByName("wet", MUSTCREATE);
    dryHandler = membrane.getHandlerByName("dry", MUSTCREATE);
    dampHandler = membrane.getHandlerByName("dry", MUSTCREATE);

    wetMap = new Map();
    dryMap = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetMap);
    // we rarely create proxies this way in our tests, so this'll be useful
    dampMap = membrane.convertArgumentToProxy(dryHandler, dampHandler, dryMap);
  }

  function expectSize(s: number) {
    expect(wetMap.size).toBe(s);
    expect(dryMap.size).toBe(s);
    expect(dampMap.size).toBe(s);
  }

  function checkMap(
    map: Map<unknown, unknown>,
    keys: unknown[],
    values: unknown[],
    shouldHave = true
  ) {
    keys.forEach(function (key, index) {
      const value = values[index];
      expect(map.has(key)).toBe(shouldHave);
      expect(map.get(key)).toBe(shouldHave ? value : undefined);

      let items: Set<unknown> | [unknown, unknown][] = new Set(map.keys());
      expect(items.has(key)).toBe(shouldHave);

      items = new Set(map.values());
      expect(items.has(value)).toBe(shouldHave);

      items = Array.from(map.entries());
      expect(
        items.some(function (item) {
          return item[0] == key && item[1] == value;
        })
      ).toBe(shouldHave);

      let foundValue = 0,
        foundKey = 0,
        foundAll = 0,
        thisArg = { isThis: true };
      map.forEach(function (this: Map<unknown, unknown>, v, k, m) {
        expect(this).toBe(thisArg);
        expect(m).toBe(map);

        if (v == value) {
          foundValue++;
        }
        if (k == key) {
          foundKey++;
        }
        if (v == value && k == key) {
          foundAll++;
        }
      }, thisArg);
      expect(foundValue).toBe(shouldHave ? 1 : 0);
      expect(foundKey).toBe(shouldHave ? 1 : 0);
      expect(foundAll).toBe(shouldHave ? 1 : 0);
    });
  }

  const dryKey1 = {},
    dryValue1 = {},
    dryKey2 = {},
    dryValue2 = {};
  dryMap.set(dryKey1, dryValue1);
  expectSize(1);
  checkMap(dryMap, [dryKey1], [dryValue1], true);
  checkMap(dryMap, [dryKey2], [dryValue2], false);

  const wetKey1 = {},
    wetValue1 = {};
  wetMap.set(wetKey1, wetValue1);
  expectSize(2);
  checkMap(dryMap, [dryKey1], [dryValue1], true);
  checkMap(dryMap, [dryKey2], [dryValue2], false);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  dryMap.set(dryKey2, dryValue2);
  expectSize(3);
  checkMap(dryMap, [dryKey1, dryKey2], [dryValue1, dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  // deleting a key it doesn't have
  dryMap.delete(dryValue1);
  expectSize(3);
  checkMap(dryMap, [dryKey1, dryKey2], [dryValue1, dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  dryMap.delete(dryKey1);
  expectSize(2);
  checkMap(dryMap, [dryKey1], [dryValue1], false);
  checkMap(dryMap, [dryKey2], [dryValue2], true);
  checkMap(wetMap, [wetKey1], [wetValue1], true);

  dryMap.clear();
  expectSize(0);
  checkMap(dryMap, [dryKey1, dryKey2], [dryValue1, dryValue2], false);
  checkMap(wetMap, [wetKey1], [wetValue1], false);
});
