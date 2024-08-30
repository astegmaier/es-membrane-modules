import { Membrane } from "../../src";

it("Iterators through a membrane work as expected", function () {
  const wet = {
    iterator: {
      count: 0,
      [Symbol.iterator]: function () {
        return {
          next: function () {
            let rv = {
              value: { count: this.count },
              done: this.count > 3
            };
            this.count++;
            return rv;
          },
          get count() {
            return wet.iterator.count;
          },
          set count(val) {
            wet.iterator.count = val;
          }
        };
      }
    }
  };
  const membrane = new Membrane();
  const handlers = {
    wet: membrane.getHandlerByName("wet", { mustCreate: true }),
    dry: membrane.getHandlerByName("dry", { mustCreate: true })
  };
  const dry: typeof wet = {
    iterator: membrane.convertArgumentToProxy(handlers.wet, handlers.dry, wet.iterator)
  };

  let items = Array.from(dry.iterator).map((val) => val.count);
  expect(items).toEqual([0, 1, 2, 3]);
});
