import { Membrane } from "../../../src";
import type { ObjectGraphHandler } from "../../../src";

it("Set instances by default in a membrane work like they do without a membrane", function () {
  "use strict";

  let membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    dampHandler: ObjectGraphHandler,
    wetSet: Set<unknown>,
    drySet: Set<unknown>,
    dampSet: Set<unknown>;
  {
    const MUSTCREATE = Object.freeze({ mustCreate: true });
    membrane = new Membrane();
    wetHandler = membrane.getHandlerByName("wet", MUSTCREATE);
    dryHandler = membrane.getHandlerByName("dry", MUSTCREATE);
    dampHandler = membrane.getHandlerByName("damp", MUSTCREATE);

    wetSet = new Set();
    drySet = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetSet);
    // we rarely create proxies this way in our tests, so this'll be useful
    dampSet = membrane.convertArgumentToProxy(dryHandler, dampHandler, drySet);
  }

  function expectSize(s: number) {
    expect(wetSet.size).toBe(s);
    expect(drySet.size).toBe(s);
    expect(dampSet.size).toBe(s);
  }

  function checkSet(set: Set<unknown>, values: unknown[], shouldHave = true) {
    values.forEach(function (value) {
      expect(set.has(value)).toBe(shouldHave);

      let items: Set<unknown> | [unknown, unknown][] = new Set(set.values());
      expect(items.has(value)).toBe(shouldHave);

      items = Array.from(set.entries());
      expect(
        items.some(function (item) {
          return item[0] == value && item[1] == value;
        })
      ).toBe(shouldHave);

      let foundValue = 0,
        foundKey = 0,
        foundAll = 0,
        thisArg = { isThis: true };
      set.forEach(function (this: Set<unknown>, v, k, s) {
        expect(this).toBe(thisArg);
        expect(s).toBe(s);

        if (v == value) {
          foundValue++;
        }
        if (k == value) {
          foundKey++;
        }
        if (v == value && k == value) {
          foundAll++;
        }
      }, thisArg);
      expect(foundValue).toBe(shouldHave ? 1 : 0);
      expect(foundKey).toBe(shouldHave ? 1 : 0);
      expect(foundAll).toBe(shouldHave ? 1 : 0);
    });
  }

  const dryValue1 = {},
    dryValue2 = {};
  drySet.add(dryValue1);
  expectSize(1);
  checkSet(drySet, [dryValue1], true);
  checkSet(drySet, [dryValue2], false);

  const wetValue1 = {};
  wetSet.add(wetValue1);
  expectSize(2);
  checkSet(drySet, [dryValue1], true);
  checkSet(drySet, [dryValue2], false);
  checkSet(wetSet, [wetValue1], true);

  drySet.add(dryValue2);
  expectSize(3);
  checkSet(drySet, [dryValue1, dryValue2], true);
  checkSet(wetSet, [wetValue1], true);

  // deleting a key it doesn't have
  drySet.delete({});
  expectSize(3);
  checkSet(drySet, [dryValue1, dryValue2], true);
  checkSet(wetSet, [wetValue1], true);

  drySet.delete(dryValue1);
  expectSize(2);
  checkSet(drySet, [dryValue1], false);
  checkSet(drySet, [dryValue2], true);
  checkSet(wetSet, [wetValue1], true);

  drySet.clear();
  expectSize(0);
  checkSet(drySet, [dryValue1, dryValue2], false);
  checkSet(wetSet, [wetValue1], false);
});
