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

    const dryChildInstanceProto = Reflect.getPrototypeOf(dryChildInstance);
    expect(dryChildInstanceProto).toBe(DryChildClass.prototype);
    expect(mockConsole).toHaveBeenNthCalledWith(1, "hello from WetBaseClass");
    expect(mockConsole).toHaveBeenNthCalledWith(2, "hello from DryChildClass");
    expect(dryChildInstance.childInitializedProp).toBe("foo");
    expect(dryChildInstance.childConstructorProp).toBe("bar");
  });

  it("CANNOT extend the class definition of a cross-membrane base class - with base class initialization", () => {
    const mockConsole = jest.fn();

    class WetBaseClass {
      public baseClassProp: string; // <-- adding this causes it to succeed 18.20.8. but it still throws in 22.17.0. This is because 18.20.8 bypasses the 'has' trap on ObjectGraphHandler, while 22.17.0 invokes the 'has', which has the same problematic logic to walk the prototype chain.
      constructor() {
        mockConsole("hello from WetBaseClass");
        // In 18.20.8 (where the initializer for baseClassProp has succeeded), this will also succeed,
        // because the existence of the property descriptor for 'baseClassProp'
        // bypasses the problematic logic that tries to walk the prototype chain in the `set` handler.
        // In 22.17.0, this will always fail.
        this.baseClassProp = "baz";
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    const dryChildInstance = new DryChildClass(); // TODO: This throws in node 22.17.0 but not in 18.20.8

    const dryChildInstanceProto = Reflect.getPrototypeOf(dryChildInstance);
    expect(dryChildInstanceProto).toBe(DryChildClass.prototype);
    expect(mockConsole).toHaveBeenCalledWith("hello from WetBaseClass");
    expect(dryChildInstance.baseClassProp).toBe("baz");
  });
});
