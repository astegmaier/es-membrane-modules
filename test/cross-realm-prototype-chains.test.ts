import { Membrane } from "../src";

// ansteg TODO: make these tests generic, and test additional permutations of
// prototype chains that include real objects and proxy objects in various orders.

function getRealProxyRealPrototypeChain() {
  const membrane = new Membrane();
  const dryHandler = membrane.getHandlerByName("dry", { mustCreate: true });
  const wetHandler = membrane.getHandlerByName("wet", { mustCreate: true });

  const realObject1: Record<string, unknown> = { object1Prop: "I came from realObject1" };

  const realObject2: Record<string, unknown> = { object2Prop: "I came from realObject2" };
  const proxyObject2 = membrane.convertArgumentToProxy(dryHandler, wetHandler, realObject2);

  const realObject3: Record<string, unknown> = { object3Prop: "I came from realObject3" };

  // Build the following prototype chain: real1 => proxy2 => real3
  Reflect.setPrototypeOf(realObject1, proxyObject2);
  Reflect.setPrototypeOf(proxyObject2, realObject3);

  return { realObject1, realObject2, proxyObject2, realObject3 };
}

describe("cross-realm prototype chains", () => {
  it("'defineProperty' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    const defaultSetDescriptor: PropertyDescriptor = {
      value: "foo",
      writable: true,
      enumerable: true,
      configurable: true
    };
    const frozenDescriptor: PropertyDescriptor = {
      value: "bar",
      writable: false,
      enumerable: false,
      configurable: false
    };

    // A new base property.
    Reflect.defineProperty(realObject1, "newProp", defaultSetDescriptor);
    expect(realObject1.newProp).toBe("foo");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "newProp")).toEqual(defaultSetDescriptor);

    Reflect.defineProperty(realObject1, "newProp", frozenDescriptor);
    expect(realObject1.newProp).toBe("bar");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "newProp")).toEqual(frozenDescriptor);

    // An existing base property.
    Reflect.defineProperty(realObject1, "object1Prop", defaultSetDescriptor);
    expect(realObject1.object1Prop).toBe("foo");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object1Prop")).toEqual(
      defaultSetDescriptor
    );

    Reflect.defineProperty(realObject1, "object1Prop", frozenDescriptor);
    expect(realObject1.object1Prop).toBe("bar");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object1Prop")).toEqual(frozenDescriptor);

    // A property that already exists on the (proxied) first prototype object.
    Reflect.defineProperty(realObject1, "object2Prop", defaultSetDescriptor);
    expect(realObject1.object2Prop).toBe("foo");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object2Prop")).toEqual(
      defaultSetDescriptor
    );

    Reflect.defineProperty(realObject1, "object2Prop", frozenDescriptor);
    expect(realObject1.object2Prop).toBe("bar");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object2Prop")).toEqual(frozenDescriptor);

    // A property that already exists on the second (non-proxied) prototype object.
    Reflect.defineProperty(realObject1, "object3Prop", defaultSetDescriptor);
    expect(realObject1.object3Prop).toBe("foo");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object3Prop")).toEqual(
      defaultSetDescriptor
    );

    Reflect.defineProperty(realObject1, "object3Prop", frozenDescriptor);
    expect(realObject1.object3Prop).toBe("bar");
    expect(Reflect.getOwnPropertyDescriptor(realObject1, "object3Prop")).toEqual(frozenDescriptor);
  });

  it("'deleteProperty' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    expect(Reflect.deleteProperty(realObject1, "object1Prop")).toBe(true);
    expect(realObject1.object1Prop).toBeUndefined();

    // Deleting a property only affects own properties, not inherited properties.
    expect(Reflect.deleteProperty(realObject1, "object2Prop")).toBe(true);
    expect(realObject1.object2Prop).toBe("I came from realObject2");
    expect(Reflect.deleteProperty(realObject1, "object3Prop")).toBe(true);
    expect(realObject1.object3Prop).toBe("I came from realObject3");

    // Deleting non-existent props no-ops
    expect(Reflect.deleteProperty(realObject1, "nonExistentProp")).toBe(true);
    expect(realObject1.nonExistentProp).toBeUndefined();
  });

  it("'get' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    expect(realObject1.nonExistentProp).toBeUndefined();
    expect(realObject1.object1Prop).toBe("I came from realObject1");
    expect(realObject1.object2Prop).toBe("I came from realObject2");
    expect(realObject1.object3Prop).toBe("I came from realObject3");
  });

  it("'getPrototypeOf' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1, proxyObject2, realObject3 } = getRealProxyRealPrototypeChain();
    const proto1 = Reflect.getPrototypeOf(realObject1)!;
    expect(proto1).toBe(proxyObject2);
    const proto2 = Reflect.getPrototypeOf(proto1);
    expect(proto2).toBe(realObject3);
  });

  it("'has' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    expect("object1Prop" in realObject1).toBe(true);
    expect("object2Prop" in realObject1).toBe(true);
    expect("object3Prop" in realObject1).toBe(true);
    expect("nonExistentProp" in realObject1).toBe(false);
  });

  it("'isExtensible' and 'preventExtensions' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    expect(Reflect.isExtensible(realObject1)).toBe(true);
    expect(Reflect.preventExtensions(realObject1)).toBe(true);
    expect(Reflect.isExtensible(realObject1)).toBe(false);
  });

  it("'ownKeys' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    expect(Reflect.ownKeys(realObject1)).toEqual(["object1Prop"]);
  });

  it("'set' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    realObject1.newProp = "foo";
  });

  it("'setPrototypeOf' operation succeeds with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    const newPrototype = {};
    expect(Reflect.setPrototypeOf(realObject1, newPrototype)).toBe(true);
    expect(Reflect.getPrototypeOf(realObject1)).toBe(newPrototype);
    expect(realObject1.object2Prop).toBeUndefined();
    expect(realObject1.object3Prop).toBeUndefined();
  });

  it("'for...in' enumeration works with a real-real-real prototype chain", () => {
    const obj1 = { object1Prop: "I came from realObject1" };
    const obj2 = { object2Prop: "I came from realObject2" };
    const obj3 = { object3Prop: "I came from realObject3" };
    Reflect.setPrototypeOf(obj1, obj2);
    Reflect.setPrototypeOf(obj2, obj3);
    let keys = [];
    for (const key in obj1) {
      keys.push(key);
    }
    expect(keys.length).toBe(3);
    expect(keys).toEqual(["object1Prop", "object2Prop", "object3Prop"]);
  });

  it("'for...in' enumeration works with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    let keys = [];
    for (const key in realObject1) {
      keys.push(key);
    }
    expect(keys.length).toBe(3);
    expect(keys).toEqual(["object1Prop", "object2Prop", "object3Prop"]);
  });

  it("'Object.entries()' enumeration works with a real-proxy-real prototype chain", () => {
    const { realObject1 } = getRealProxyRealPrototypeChain();
    const entries = Object.entries(realObject1);
    expect(entries.length).toBe(1); // Object.entries only returns own properties, not inherited ones.
    expect(entries).toEqual([["object1Prop", "I came from realObject1"]]);
  });
});
