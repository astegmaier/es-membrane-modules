import { Membrane } from "../../src";
import type { ObjectGraphHandler } from "../../src";

interface IGeneratorGraph {
  buildGenerator(): Generator<{ count: number }, string, string>;
}

interface IGeneratorsMocks {
  wet: IGeneratorGraph;
  dry: IGeneratorGraph;
  handlers: { wet: ObjectGraphHandler; dry: ObjectGraphHandler };
  membrane: Membrane;
  response: { value: true };
}

describe("Generators through a membrane", function () {
  let parts: IGeneratorsMocks;

  beforeEach(function () {
    const buildGenerator = function* () {
      let count = 0;
      while (true) {
        yield { count };
        count++;
      }
    };
    const membrane = new Membrane();
    const wet = membrane.getHandlerByName("wet", { mustCreate: true });
    const dry = membrane.getHandlerByName("dry", { mustCreate: true });

    parts = {
      wet: {
        buildGenerator
      },
      dry: {
        buildGenerator: membrane.convertArgumentToProxy(wet, dry, buildGenerator)
      },
      handlers: { wet, dry },
      membrane,
      response: { value: true }
    };
  });

  it("work with normal stepping and a return call", function () {
    let generator = parts.dry.buildGenerator();
    expect(generator.next()).toEqual({ value: { count: 0 }, done: false });
    expect(generator.next()).toEqual({ value: { count: 1 }, done: false });
    expect(generator.return("x")).toEqual({ value: "x", done: true });
    expect(generator.next()).toEqual({ value: undefined, done: true });
  });

  it("work with normal stepping and a throw call", function () {
    let generator = parts.dry.buildGenerator();
    expect(generator.next()).toEqual({ value: { count: 0 }, done: false });
    expect(generator.next()).toEqual({ value: { count: 1 }, done: false });
    let result;
    expect(function () {
      result = generator.throw("foo");
    }).toThrow("foo");
    expect(result).toBe(undefined);
    expect(generator.next()).toEqual({ value: undefined, done: true });
  });
});
