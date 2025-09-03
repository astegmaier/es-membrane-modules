import { Membrane } from "../src";

describe("cross-realm class inheritance", () => {
  it("can construct a simple class where the definition lives on the other side of the membrane.", () => {
    class WetBaseClass {
      baseClassProp: string;
      constructor() {
        this.baseClassProp = "Gagaga";
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    const dryBaseClassInstance = new DryBaseClass();
    expect(Reflect.getPrototypeOf(dryBaseClassInstance)).toBe(DryBaseClass.prototype);
  });

  it("can extend the class definition of a cross-membrane base class", () => {
    class WetBaseClass {}

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    const dryChildInstance = new DryChildClass();

    expect(Reflect.getPrototypeOf(dryChildInstance)).toBe(DryChildClass.prototype);
  });

  it("can extend the class definition of a cross-membrane base class - with no-op constructors.", () => {
    const mockConsole = jest.fn();

    class WetBaseClass {
      constructor() {
        mockConsole("hello from WetBaseClass");
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {
      constructor() {
        super();
        mockConsole("hello from DryChildClass");
      }
    }

    const dryChildInstance = new DryChildClass();

    expect(Reflect.getPrototypeOf(dryChildInstance)).toBe(DryChildClass.prototype);
    expect(mockConsole).toHaveBeenNthCalledWith(1, "hello from WetBaseClass");
    expect(mockConsole).toHaveBeenNthCalledWith(2, "hello from DryChildClass");
  });

  it("can extend the class definition of a cross-membrane base class - with child prop initialization", () => {
    const mockConsole = jest.fn();

    class WetBaseClass {
      constructor() {
        mockConsole("hello from WetBaseClass");
        // // @ts-expect-error
        // this.baseClassProp = "gaga"; // <-- this causes an error.
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {
      public childInitializedProp = "foo";
      constructor() {
        super();
        mockConsole("hello from DryChildClass");
        this.childConstructorProp = "bar";
      }
    }

    const dryChildInstance = new DryChildClass();

    expect(Reflect.getPrototypeOf(dryChildInstance)).toBe(DryChildClass.prototype);
    expect(mockConsole).toHaveBeenNthCalledWith(1, "hello from WetBaseClass");
    expect(mockConsole).toHaveBeenNthCalledWith(2, "hello from DryChildClass");
    expect(dryChildInstance.childInitializedProp).toBe("foo");
    expect(dryChildInstance.childConstructorProp).toBe("bar");
  });

  it("CANNOT extend the class definition of a cross-membrane base class - with base class initialization", () => {
    const mockConsole = jest.fn();

    class WetBaseClass {
      public baseClassProp: string;
      constructor() {
        mockConsole("hello from WetBaseClass");
        this.baseClassProp = "baz"; // <-- adding this causes causes an error.
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    // TODO: we need to understand why this is happening.
    expect(() => new DryChildClass()).toThrow("Must find membrane value for prototype");
  });
});
