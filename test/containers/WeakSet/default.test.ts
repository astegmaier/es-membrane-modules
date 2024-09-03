import { Membrane } from "../../../src";
import type { ObjectGraphHandler } from "../../../src";

it("Set instances by default in a membrane work like they do without a membrane", function () {
  "use strict";

  let membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    dampHandler: ObjectGraphHandler,
    wetSet: WeakSet<object>,
    drySet: WeakSet<object>,
    dampSet: WeakSet<object>;
  {
    const MUSTCREATE = Object.freeze({ mustCreate: true });
    membrane = new Membrane();
    wetHandler = membrane.getHandlerByName("wet", MUSTCREATE);
    dryHandler = membrane.getHandlerByName("dry", MUSTCREATE);
    dampHandler = membrane.getHandlerByName("damp", MUSTCREATE);

    wetSet = new WeakSet();
    drySet = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetSet);
    // we rarely create proxies this way in our tests, so this'll be useful
    dampSet! = membrane.convertArgumentToProxy(dryHandler, dampHandler, drySet);
  }

  function checkSet(set: WeakSet<object>, values: object[], shouldHave = true) {
    values.forEach(function (value) {
      expect(set.has(value)).toBe(shouldHave);
    });
  }

  const dryValue1 = {},
    dryValue2 = {};
  drySet.add(dryValue1);
  checkSet(drySet, [dryValue1], true);
  checkSet(drySet, [dryValue2], false);

  const wetValue1 = {};
  wetSet.add(wetValue1);
  checkSet(drySet, [dryValue1], true);
  checkSet(drySet, [dryValue2], false);
  checkSet(wetSet, [wetValue1], true);

  drySet.add(dryValue2);
  checkSet(drySet, [dryValue1, dryValue2], true);
  checkSet(wetSet, [wetValue1], true);

  // deleting a key it doesn't have
  drySet.delete({});
  checkSet(drySet, [dryValue1, dryValue2], true);
  checkSet(wetSet, [wetValue1], true);

  drySet.delete(dryValue1);
  checkSet(drySet, [dryValue1], false);
  checkSet(drySet, [dryValue2], true);
  checkSet(wetSet, [wetValue1], true);
});
