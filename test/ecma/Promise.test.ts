import { Membrane } from "../../src";
import type { ObjectGraphHandler } from "../../src";

interface IResponse {
  value: true;
}

interface IPromiseGraph {
  wrapper: {
    promise: Promise<IResponse | void>;
    resolve: (value: IResponse | PromiseLike<IResponse>) => void;
    reject: (value: unknown) => void;
  };
}

interface IPromiseMocks {
  wet: IPromiseGraph;
  dry: IPromiseGraph;
  handlers: { wet: ObjectGraphHandler; dry: ObjectGraphHandler };
  membrane: Membrane;
  response: IResponse;
}

describe("Promises through a membrane", function () {
  let parts: IPromiseMocks;
  beforeEach(function () {
    const membrane = new Membrane();
    parts = {
      wet: {
        wrapper: {}
      } as IPromiseGraph,
      dry: {} as IPromiseGraph,
      handlers: {
        wet: membrane.getHandlerByName("wet", { mustCreate: true }),
        dry: membrane.getHandlerByName("dry", { mustCreate: true })
      },
      membrane,

      response: { value: true }
    };

    parts.wet.wrapper.promise = new Promise(function (resolve, reject) {
      parts.wet.wrapper.resolve = resolve;
      parts.wet.wrapper.reject = reject;
    });

    parts.dry.wrapper = parts.membrane.convertArgumentToProxy(
      parts.handlers.wet,
      parts.handlers.dry,
      parts.wet.wrapper
    );
  });

  it("may be resolved on the wet side (where the promise came from)", function (done) {
    expect(parts.dry.wrapper.promise).not.toBe(parts.wet.wrapper.promise);
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(function (result) {
      expect(result!.value).toBe(true);
    }, fail);
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(done, done);
    parts.wet.wrapper.resolve(parts.response);
  });

  it("may be rejected on the wet side", function (done) {
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(fail, function (result) {
      expect(result.value).toBe(true);
    });
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(done, done);
    parts.wet.wrapper.reject(parts.response);
  });

  it("may be resolved on the dry side", function (done) {
    expect(parts.dry.wrapper.promise).not.toBe(parts.wet.wrapper.promise);
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(function (result) {
      expect(result!.value).toBe(true);
    }, fail);
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(done, done);
    parts.dry.wrapper.resolve(parts.response);
  });

  it("may be rejected on the dry side", function (done) {
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(fail, function (result) {
      expect(result.value).toBe(true);
    });
    parts.dry.wrapper.promise = parts.dry.wrapper.promise.then(done, done);
    parts.dry.wrapper.reject(parts.response);
  });
});
