import { DataDescriptor } from "../../src/sharedUtilities";
import assert from "../assert";

export function getElementWet(NodeWet) {
  function ElementWet(ownerDoc, name) {
    NodeWet.apply(this, arguments); // this takes care of ownerDoc
    Object.defineProperty(this, "nodeType", new DataDescriptor(1));
    Object.defineProperty(this, "nodeName", new DataDescriptor(name));
  }
  ElementWet.prototype = new NodeWet(null);

  {
    assert(
      Object.getPrototypeOf(ElementWet.prototype) === NodeWet.prototype,
      "prototype chain mismatch of ElementWet"
    );
    let k = new ElementWet({}, "k");
    assert(
      Object.getPrototypeOf(k) === ElementWet.prototype,
      "prototype chain mismatch of a created ElementWet instance"
    );
  }
  return ElementWet;
}
