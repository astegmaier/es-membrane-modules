import { MembraneMocks } from "../mocks";

describe("Private API methods are not exposed when the membrane is marked 'secured': ", function() {
  "use strict";
  var wetDocument, dryDocument, membrane, isPrivate;
  
  beforeEach(function() {
    let parts = MembraneMocks();
    wetDocument = parts.wet.doc;
    dryDocument = parts.dry.doc;
    membrane = parts.membrane;
    isPrivate = membrane.secured;
  });

  afterEach(function() {
    wetDocument = null;
    dryDocument = null;
    membrane = null;
  });

  it("Membrane.prototype.buildMapping", function() {
    const actual = typeof membrane.buildMapping;
    expect(actual).toBe(isPrivate ? "undefined" : "function");
  });
});
