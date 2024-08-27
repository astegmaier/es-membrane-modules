import assert from "../assert";
import type { IMockNode, IMockNodeConstructor } from "./getNodeWet";

export interface IMockElement extends IMockNode {
  nodeType: number;
  nodeName: string;
  [key: string]: any;
}

export interface IMockElementConstructor {
  new (ownerDoc: any, name: string): IMockElement;
}

export function getElementWet(NodeWet: IMockNodeConstructor): IMockElementConstructor {
  class ElementWet extends NodeWet implements IMockElement {
    override nodeType = 1;
    public nodeName: string;
    constructor(ownerDocument: any, name: string) {
      super(ownerDocument);
      this.nodeName = name;
    }
  }
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
