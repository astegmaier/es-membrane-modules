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

  it("Non-membrane test with base-class initialization", () => {
    // This test illustrates the default non-proxy behavior, so we can compare membrane behavior against it below.
    class BaseClass {
      public baseClassProp: string;
      constructor() {
        // 'this' is a value with a prototype chain that looks like this:
        // {} > ChildClass.prototype > BaseClass.prototype > Object.prototype > null
        const thisProto: any = Reflect.getPrototypeOf(this);
        const thisProtoProto: any = Reflect.getPrototypeOf(thisProto);
        const thisProtoProtoProto: any = Reflect.getPrototypeOf(thisProtoProto);
        const newTargetProto: any = Reflect.getPrototypeOf(new.target);

        expect(thisProto).toBe(ChildClass.prototype);
        expect(thisProto.constructor).toBe(ChildClass);
        expect(thisProto.constructor.name).toBe("ChildClass");
        expect(new.target).toBe(ChildClass);
        expect(new.target.name).toBe("ChildClass");
        expect(thisProtoProto).toBe(BaseClass.prototype);
        expect(thisProtoProto.constructor).toBe(BaseClass);
        expect(thisProtoProto.constructor.name).toBe("BaseClass");
        expect(newTargetProto).toBe(BaseClass);
        expect(newTargetProto.name).toBe("BaseClass");
        expect(thisProtoProtoProto).toBe(Object.prototype); // This is where we're choking in the proxy case.
        expect(Reflect.getPrototypeOf(thisProtoProtoProto)).toBe(null);

        this.baseClassProp = "baz";
      }
    }

    class ChildClass extends BaseClass {}

    const childInstance = new ChildClass();

    const childInstanceProto = Reflect.getPrototypeOf(childInstance);
    expect(childInstanceProto).toBe(ChildClass.prototype);
    expect(childInstance.baseClassProp).toBe("baz");
    // this.baseClassProp is defined directly on the ChildClass instance, not on the prototype chain.
    expect(Reflect.getOwnPropertyDescriptor(childInstance, "baseClassProp")!.value).toBe("baz");
  });

  it("can extend the class definition of a cross-membrane base class - with a base class constructor initializer", () => {
    const mockConsole = jest.fn();

    class WetBaseClass {
      constructor() {
        mockConsole("hello from WetBaseClass");

        const thisProto: any = Reflect.getPrototypeOf(this);
        const thisProtoProto: any = Reflect.getPrototypeOf(thisProto);
        const thisProtoProtoProto: any = Reflect.getPrototypeOf(thisProtoProto);
        const newTargetProto: any = Reflect.getPrototypeOf(new.target);

        expect(thisProto).toBe(WetChildClass.prototype);
        expect(thisProto.constructor).toBe(WetChildClass);
        expect(thisProto.constructor.name).toBe("rv"); // <-- this SHOULD be 'WetChildClass'
        expect(new.target).toBe(WetChildClass);
        expect(new.target.name).toBe("rv"); // <-- this SHOULD be 'WetChildClass'
        expect(thisProtoProto).toBe(WetBaseClass.prototype);
        expect(thisProtoProto.constructor).toBe(WetBaseClass);
        expect(newTargetProto).toBe(WetBaseClass);
        expect(thisProtoProtoProto).toBe(Object.prototype);
        expect(Reflect.getPrototypeOf(thisProtoProtoProto)).toBe(null);

        // This test will fail in node 22.17.0 AND 18.20.8, because it invokes the problematic 'set' trap in both cases.
        (this as any).baseClassProp = "baz";
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}
    const WetChildClass = membrane.convertArgumentToProxy(dryHandler, wetHandler, DryChildClass);

    const dryChildInstance = new DryChildClass();

    const dryChildInstanceProto = Reflect.getPrototypeOf(dryChildInstance);
    expect(dryChildInstanceProto).toBe(DryChildClass.prototype);
    expect(mockConsole).toHaveBeenCalledWith("hello from WetBaseClass");
    expect(dryChildInstance.baseClassProp).toBe("baz");
    expect(Reflect.getOwnPropertyDescriptor(dryChildInstance, "baseClassProp")!.value).toBe("baz");
  });

  it("can extend the class definition of a cross-membrane base class - with base class property initializer", () => {
    class WetBaseClass {
      // Doing initialization here instead of on the constructor causes the test to succeed in node 18.20.8.
      // But it still throws in node 22.17.0. This is because 18.20.8 bypasses the 'has' trap on ObjectGraphHandler,
      // while 22.17.0 invokes the 'has', which has the same problematic logic to walk the prototype chain.
      public baseClassProp: string = "baz";
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    const dryChildInstance = new DryChildClass();

    const dryChildInstanceProto = Reflect.getPrototypeOf(dryChildInstance);
    expect(dryChildInstanceProto).toBe(DryChildClass.prototype);
    expect(dryChildInstance.baseClassProp).toBe("baz");
    expect(Reflect.getOwnPropertyDescriptor(dryChildInstance, "baseClassProp")!.value).toBe("baz");
  });

  it("can extend the class definition of a cross-membrane base class - with constructor initializer + base class property definition", () => {
    class WetBaseClass {
      // Adding a property definition here will define the property as undefined _before_ 'this' is passed
      // to the constructor. In Node 18.20.8, this causes the test to succeed.
      // However, in node 22.17.0, the test still fails, because defining the property here invokes the 'has' trap
      // on ObjectGraphHandler (unlike what 18.20.8 will do), which has the same problematic logic to walk the
      // prototype chain as the 'set' trap (invoked by the constructor) does.
      public baseClassProp: string;
      constructor() {
        this.baseClassProp = "baz";
      }
    }

    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    const dryChildInstance = new DryChildClass();

    const dryChildInstanceProto = Reflect.getPrototypeOf(dryChildInstance);
    expect(dryChildInstanceProto).toBe(DryChildClass.prototype);
    expect(dryChildInstance.baseClassProp).toBe("baz");
    expect(Reflect.getOwnPropertyDescriptor(dryChildInstance, "baseClassProp")!.value).toBe("baz");
  });

  it("correctly wraps values that might be initialized in a cross-membrane base class", () => {
    const membrane = new Membrane();
    const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
    const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

    const wetProperty = { hello: "world" };
    const dryProperty = membrane.convertArgumentToProxy(wetHandler, dryHandler, wetProperty);

    class WetBaseClass {
      constructor() {
        // We deliberately omitted the property initializer, so we can test "pure" constructor initialization.
        (this as any).baseClassProp = wetProperty;
      }
    }
    const DryBaseClass = membrane.convertArgumentToProxy(wetHandler, dryHandler, WetBaseClass);

    class DryChildClass extends DryBaseClass {}

    const dryChildInstance = new DryChildClass();

    expect(dryChildInstance.baseClassProp).toBe(dryProperty);
  });
});
