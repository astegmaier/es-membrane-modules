import { Membrane } from "../../src";
import type { ObjectGraphHandler } from "../../src";

/* Sometimes, we just want a proxy trap to be dead and unavailable.  For
 * example, some functions should never be callable as constructors.  Others
 * should only be callable as constructors.  The .disableTraps() API allows us
 * to enforce this rule.
 */

describe("Membrane.modifyRulesAPI.disableTraps() allows the user to prevent", function () {
  var membrane: Membrane,
    wetHandler: ObjectGraphHandler,
    dryHandler: ObjectGraphHandler,
    dryVoid: { (zero: 0): void; new (zero: 0): {} };
  function voidFunc() {}

  beforeEach(function () {
    membrane = new Membrane();
    wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    dryVoid = membrane.convertArgumentToProxy(wetHandler, dryHandler, voidFunc);
  });

  afterEach(function () {
    wetHandler.revokeEverything();
    dryHandler.revokeEverything();
    wetHandler = null as any;
    dryHandler = null as any;
    membrane = null as any;
  });

  it("invoking a function via .apply from the wet object graph", function () {
    membrane.modifyRules.disableTraps("wet", voidFunc, ["apply"]);
    let message = null;
    try {
      dryVoid(0);
    } catch (ex: any) {
      message = ex.message;
    }
    expect(message).toBe("The apply trap is not executable.");
  });

  it("invoking a function via .apply from the dry object graph", function () {
    membrane.modifyRules.disableTraps("dry", dryVoid, ["apply"]);
    let message = null;
    try {
      dryVoid(0);
    } catch (ex: any) {
      message = ex.message;
    }
    expect(message).toBe("The apply trap is not executable.");
  });

  it("invoking a function via .construct from the wet object graph", function () {
    membrane.modifyRules.disableTraps("wet", voidFunc, ["construct"]);
    let message = null;
    try {
      new dryVoid(0);
    } catch (ex: any) {
      message = ex.message;
    }
    expect(message).toBe("The construct trap is not executable.");
  });

  it("invoking a function via .construct from the dry object graph", function () {
    membrane.modifyRules.disableTraps("dry", dryVoid, ["construct"]);
    var message = null;
    try {
      new dryVoid(0);
    } catch (ex: any) {
      message = ex.message;
    }
    expect(message).toBe("The construct trap is not executable.");
  });
});
