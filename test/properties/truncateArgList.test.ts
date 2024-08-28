import { MembraneMocks } from "../../mocks";
import type { IDocument, IMocks } from "../../mocks";
import type { Membrane } from "../../src";

describe("Truncation of argument lists", function () {
  "use strict";

  let wetDocument: IDocument, dryDocument: IDocument, membrane: Membrane, parts: IMocks;
  const arg0 = "arg0",
    arg1 = "arg1",
    arg2 = "arg2";

  let argCount: number,
    target: {
      (arg0: "arg0", arg1: "arg1", arg2: "arg2"): void;
      new (arg0: "arg0", arg1: "arg1", arg2: "arg2"): {};
    },
    check: (arg0: "arg0", arg1: "arg1", arg2: "arg2") => void,
    truncator: (limit1: any, limit2?: any) => void;

  // a and b are here solely to check for function arity.
  function checkArgCount(_a: "arg0", _b: "arg1") {
    argCount = arguments.length;
    if (arguments.length > 0) {
      expect(arguments[0]).toBe(arg0);
    }
    if (arguments.length > 1) {
      expect(arguments[1]).toBe(arg1);
    }
    if (arguments.length > 2) {
      expect(arguments[2]).toBe(arg2);
    }
  }

  beforeEach(function () {
    parts = MembraneMocks();
    wetDocument = parts.wet.doc;
    dryDocument = parts.dry.doc;
    membrane = parts.membrane;

    wetDocument.checkArgCount = checkArgCount;
    target = dryDocument.checkArgCount;

    argCount = NaN;
  });

  afterEach(function () {
    wetDocument = null as any;
    dryDocument = null as any;
    check = null as any;
  });

  function defineTests(_fieldName: unknown) {
    it("is disabled by default:  any number of arguments is allowed", function () {
      target(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("goes to the function's arity when truncateArgList is invoked with true", function () {
      truncator(true);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(2);
    });

    it("allows any number of arguments when truncateArgList is invoked with false", function () {
      truncator(false);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("goes to the specified length when truncateArgList is invoked with a positive number", function () {
      truncator(1);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(1);
    });

    it("goes to the specified length when truncateArgList is invoked with 0", function () {
      truncator(0);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(0);
    });

    it("does not add arguments when truncateArgList is invoked with a number greater than the functipn's arity", function () {
      truncator(100);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with a non-integer number", function () {
      expect(function () {
        truncator(2.5);
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with a negative number", function () {
      expect(function () {
        truncator(-1);
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with an infinite number", function () {
      expect(function () {
        truncator(Infinity);
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with NaN", function () {
      expect(function () {
        truncator(NaN);
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with a string", function () {
      expect(function () {
        truncator("foo");
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });

    it("is rejected when truncateArgList is invoked with an object", function () {
      expect(function () {
        truncator({});
      }).toThrow();
      check(arg0, arg1, arg2);
      expect(argCount).toBe(3);
    });
  }

  function defineGraphTests(fieldName: "dry" | "wet") {
    beforeEach(function () {
      truncator = function (limit: boolean | number) {
        membrane.modifyRules.truncateArgList(fieldName, parts[fieldName].doc.checkArgCount, limit);
      };
    });

    describe("and the apply trap", function () {
      beforeEach(function () {
        check = dryDocument.checkArgCount;
      });
      defineTests(fieldName);
    });

    describe("and the construct trap", function () {
      beforeEach(function () {
        check = function (a0, a1, a2) {
          return new target(a0, a1, a2);
        };
      });
      defineTests(fieldName);
    });
  }

  describe("on the wet graph", function () {
    defineGraphTests("wet");
  });

  describe("on the dry graph", function () {
    defineGraphTests("dry");
  });

  describe("on both the wet and dry graphs, the lower non-negative integer applies", function () {
    beforeEach(function () {
      truncator = function (wetLimit: boolean | number, dryLimit: boolean | number) {
        membrane.modifyRules.truncateArgList("wet", parts.wet.doc.checkArgCount, wetLimit);

        membrane.modifyRules.truncateArgList("dry", parts.dry.doc.checkArgCount, dryLimit);

        check = dryDocument.checkArgCount;
      };
    });

    it("from the wet graph", function () {
      truncator(1, 3);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(1);
    });

    it("from the dry graph", function () {
      truncator(3, 1);
      check(arg0, arg1, arg2);
      expect(argCount).toBe(1);
    });
  });
});
