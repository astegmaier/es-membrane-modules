/**
 * This function tries to stringify an object into human-readable form (e.g., to add as text into a "<pre>" tag).
 * It will try to make an outline of the object's properties, and will skip things that would normally cause
 * JSON.stringify to throw (e.g., circular references).
 *
 * If for some reason it's still unable to display the object properly, it will return a placeholder
 * '<Could not stringify object>' message, but it will *never* throw. Hence "safe" in its name.
 */
export function safeStringify(obj: unknown): string {
  try {
    return stringifyPlusPlus(obj);
  } catch (e) {
    return "<Could not stringify object>";
  }
}

type UnknownObject = { [key: string | number | symbol]: unknown };

/** The maximum number of nested objects we will stringify. */
const MAXIMUM_DEPTH = 3;

/** The maximum number of properties we will stringify on a single (non-nested) object. */
const MAXIMUM_BREADTH = 20;

/** The maximum number of prototypes we will examine for properties to stringify. */
const MAXIMUM_PROTOTYPE_CHAIN_DEPTH = 5;

/** An extra defensive limit to ensure that we never loop infinitely in the JSON.stringify 'replacer' function. */
const MAXIMUM_REPLACER_LOOPS = 100000;

/** A unique symbol that we use to attach the original object to a snapshot, so we can correctly detect circularity. */
const originalObjectRef = Symbol("originalObject");

function stringifyPlusPlus(object: unknown): string {
  if (object === null) {
    return "null";
  }

  if (typeof object === "undefined") {
    return "undefined";
  }

  if (Array.isArray(object)) {
    return (
      "[" +
      "\n" +
      indentAll(object.map((item) => stringifyPlusPlus(quoteStrings(item))).join("," + "\n")) +
      "\n" +
      "]"
    );
  }

  if (isError(object)) {
    try {
      // Firefox makes the `stack` property of an object available as a getter on the Error prototype,
      // which our stringify algorithm will drop unless we explicitly pull this out.
      (object as any).stack = object.stack;
      return (
        (object.message ? `${object.name}: ${object.message}` : object.name) +
        "\n" +
        jsonStringify(object)
      );
    } catch (e) {
      return stringifyPlusPlus(object.toString());
    }
  }

  if (object.toString() !== "[object Object]") {
    return object.toString();
  }

  // Otherwise, stringify the object
  return jsonStringify(object);

  ////////////////////////////////////

  // Helpers:
  function jsonStringify(object: unknown): string {
    const objectStack: unknown[] = [];
    let replacerLoopCount = 0;
    return JSON.stringify(
      object,
      function replacer(_key, value) {
        // An extra defensive check to ensure that we never loop infinitely.
        replacerLoopCount += 1;
        if (replacerLoopCount > MAXIMUM_REPLACER_LOOPS) {
          return undefined;
        }

        // `getStringifiableSnapshot` returns new objects, but it stores the original one in a special property, so we can detect circularity.
        // Within a replacer function, 'this' corresponds to the parent object.
        const originalParentObject =
          typeof this === "object" && this !== null && this[originalObjectRef]
            ? this[originalObjectRef]
            : this;

        // If the replacer is traversing a new object, wind back the stack to the parent object that matches.
        while (
          objectStack.length > 0 &&
          originalParentObject !== objectStack[objectStack.length - 1]
        ) {
          objectStack.pop();
        }

        switch (typeof value) {
          case "function":
            return `[Function]`;
          case "number":
            if (isFinite(value)) {
              return value;
            } else if (Number.isNaN(value)) {
              return "NaN";
            } else if (value === Number.POSITIVE_INFINITY) {
              return "Infinity";
            } else if (value === Number.NEGATIVE_INFINITY) {
              return "-Infinity";
            } else {
              return "[Number]";
            }
          case "object":
            if (value === null) {
              return null;
            }
            if (objectStack.find((item) => item === value)) {
              return `[Circular]`;
            }
            if (objectStack.length >= MAXIMUM_DEPTH) {
              return Array.isArray(value) ? `[Array(${value.length})]` : "[Object]";
            }
            objectStack.push(value);
            return Array.isArray(value) ? value : getStringifiableSnapshot(value);
          default:
            return value;
        }
      },
      4
    );

    ///////////////////////////////////

    /**
     * Returns a `snapshot` object that has getters for all properties, both
     * enumerable and non-enumerable on a given object and it's prototype chain.
     * (This is helpful because by default, `JSON.stringify` will ignore non-own and non-enumerable properties).
     * To prevent infinite loops, it will limit the number of properties and prototypes that it traverses.
     */
    function getStringifiableSnapshot(object: UnknownObject): UnknownObject {
      const snapshot: UnknownObject = {};
      snapshot[originalObjectRef] = object; // We need to store the original object in a special property so we can detect circularity correctly.
      let prototypeChainCounter = 0;
      let breadthCounter = 0;

      try {
        addAllPropertiesToSnapshot(object);
        return snapshot;
      } catch (e) {
        return object;
      }

      function addAllPropertiesToSnapshot(current: UnknownObject) {
        // Add all 'own' properties (including non-enumerable properties) to the snapshot.
        for (const ownPropName of Object.getOwnPropertyNames(current)) {
          breadthCounter += 1;
          if (breadthCounter > MAXIMUM_BREADTH) {
            snapshot["..."] = "...";
            return;
          }
          tryAddName(ownPropName);
        }

        // A defensive check to make sure we don't trigger an infinite while walking the prototype chain.
        prototypeChainCounter += 1;
        if (prototypeChainCounter > MAXIMUM_PROTOTYPE_CHAIN_DEPTH) {
          snapshot["..."] = "...";
          return;
        }

        // Stop traversing prototypes if we've reached the end of the chain,
        // or there are no enumerable properties on the next prototype that are not already present on the snapshot.
        const nextPrototype: UnknownObject | null = Object.getPrototypeOf(current);
        if (
          !nextPrototype ||
          Object.keys(nextPrototype).every((key) =>
            Object.prototype.hasOwnProperty.call(snapshot, key)
          )
        ) {
          return;
        }

        // Otherwise, continue to recursively traverse the prototype chain.
        addAllPropertiesToSnapshot(nextPrototype);
      }

      function tryAddName(name: string) {
        if (name.indexOf(" ") < 0 && !Object.prototype.hasOwnProperty.call(snapshot, name)) {
          Object.defineProperty(snapshot, name, {
            configurable: true,
            enumerable: true,
            get: () => object[name]
          });
        }
      }
    }
  }
}

function indentAll(text: string): string {
  return text
    .split("\n")
    .map((line) => new Array(4).fill(" ").join("") + line)
    .join("\n");
}

export function isError(obj: unknown): obj is Error {
  // Checking for error object in this way (though weird) is spec compliant
  // and also necessary so we can distinguish catch errors generated in a different iframe context.
  // See: https://stackoverflow.com/a/61958148/4739687
  return Object.prototype.toString.call(obj) === "[object Error]";
}

function quoteStrings(item: unknown) {
  if (typeof item === "string") {
    return `"${item}"`;
  }
  return item;
}

// cspell:ignore stringifiable
