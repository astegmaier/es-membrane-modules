import { MembraneMocks } from "../mocks";
import type { Membrane } from "../src";

describe("Private API methods are not exposed when the membrane is marked 'secured': ", function () {
  let membrane: Membrane | null, isPrivate: boolean;

  beforeEach(function () {
    let parts = MembraneMocks();
    membrane = parts.membrane;
    isPrivate = membrane.secured;
  });

  afterEach(function () {
    membrane = null;
  });

  it("Membrane.prototype.buildMapping", function () {
    const actual = typeof membrane!.buildMapping;
    expect(actual).toBe(isPrivate ? "undefined" : "function");
  });
});
