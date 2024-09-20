import { createMembraneProxy } from "./testUtils/createMembraneProxy";

/** Default values for the descriptor when using defineProperty */
const DEFAULT_DEFINE: PropertyDescriptor = {
  configurable: false,
  enumerable: false,
  writable: false
};

/** Default values for the descriptor when using normal property assignment (e.g. obj.a = "foo") */
const DEFAULT_ASSIGNMENT: PropertyDescriptor = {
  configurable: true,
  enumerable: true,
  writable: true
};

/** Given a property descriptor, omits values that are the same as the default value. */
function omitDefaultProps(descriptor: PropertyDescriptor): PropertyDescriptor {
  let prunedDescriptor: PropertyDescriptor = {};
  const keys = Object.keys(descriptor) as (keyof PropertyDescriptor)[];
  keys.forEach((key) => {
    if (descriptor[key] !== DEFAULT_DEFINE[key]) {
      prunedDescriptor[key] = descriptor[key];
    }
  });
  return prunedDescriptor;
}

/** Tests that defineProperty works correctly end-to-end for a given initial value and descriptor. */
function testDefineProperty(
  obj: { a?: string },
  descriptor: PropertyDescriptor,
  defaultPropertyDescriptor: PropertyDescriptor
) {
  const success = Reflect.defineProperty(obj, "a", descriptor);
  expect(success).toBe(true);
  expect(Reflect.getOwnPropertyDescriptor(obj, "a")).toEqual({
    value: "foo",
    ...defaultPropertyDescriptor,
    ...descriptor
  });
  if (descriptor.enumerable) {
    expect(Object.entries(obj)).toEqual([["a", "foo"]]);
  }
}

function testAll(descriptor: PropertyDescriptor) {
  // Tests for using Reflect.defineProperty on a pre-existing property...
  {
    // ...with a "complete" descriptor
    testDefineProperty({ a: "foo" }, descriptor, DEFAULT_ASSIGNMENT);
    testDefineProperty(createMembraneProxy({ a: "foo" }).proxy, descriptor, DEFAULT_ASSIGNMENT);

    // ...with a "partial" descriptor
    testDefineProperty({ a: "foo" }, omitDefaultProps(descriptor), DEFAULT_ASSIGNMENT);
    testDefineProperty(
      createMembraneProxy({ a: "foo" }).proxy,
      omitDefaultProps(descriptor),
      DEFAULT_ASSIGNMENT
    );
  }

  // Tests for using Reflect.defineProperty on a not-yet-existing property...
  {
    // ...with a "complete" descriptor
    testDefineProperty({}, { ...descriptor, value: "foo" }, DEFAULT_DEFINE);
    testDefineProperty(
      createMembraneProxy({}).proxy,
      {
        ...descriptor,
        value: "foo"
      },
      DEFAULT_DEFINE
    );

    // ...with a "partial" descriptor
    testDefineProperty({}, { ...omitDefaultProps(descriptor), value: "foo" }, DEFAULT_DEFINE);
    testDefineProperty(
      createMembraneProxy({}).proxy,
      {
        ...omitDefaultProps(descriptor),
        value: "foo"
      },
      DEFAULT_DEFINE
    );
  }
}

describe("defineProperty on a proxy with a partial (or complete) descriptor should work on pre-existing (or not-yet-existing) properties", () => {
  it("works with a non-configurable, non-writable, non-enumerable descriptor", () => {
    testAll({
      configurable: false,
      writable: false,
      enumerable: false
    });
  });
  it("works with a non-configurable, non-writable, enumerable descriptor", () => {
    testAll({
      configurable: false,
      writable: false,
      enumerable: true
    });
  });
  it("works with a non-configurable, writable, non-enumerable descriptor", () => {
    testAll({
      configurable: false,
      writable: true,
      enumerable: false
    });
  });
  it("works with a non-configurable, writable, enumerable descriptor", () => {
    testAll({
      configurable: false,
      writable: true,
      enumerable: true
    });
  });
  it("works with a configurable, non-writable, non-enumerable descriptor", () => {
    testAll({
      configurable: true,
      writable: false,
      enumerable: false
    });
  });
  it("works with a configurable, non-writable, enumerable descriptor", () => {
    testAll({
      configurable: true,
      writable: false,
      enumerable: true
    });
  });
  it("works with a configurable, writable, non-enumerable descriptor", () => {
    testAll({
      configurable: true,
      writable: true,
      enumerable: false
    });
  });
  it("works with a configurable, writable, enumerable descriptor", () => {
    testAll({
      configurable: true,
      writable: true,
      enumerable: true
    });
  });
});
