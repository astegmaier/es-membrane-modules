import { NOT_IMPLEMENTED_DESC } from "../../src/utils/sharedUtilities";
import type { IMockEventTarget, IMockEventTargetConstructor } from "./EventTargetWet";

interface IWetMarker {
  marker: string;
}

export interface IMockNode extends IMockEventTarget {
  childNodes: any[];
  ownerDocument: any;
  wetMarker: IWetMarker;
  nodeType: any;
  insertBefore(newChild: IMockNode, refChild: IMockNode): any;
  firstChild: any;
  shouldNotBeAmongKeys: boolean;
}

export interface IMockNodeConstructor {
  new (ownerDocument: any): IMockNode;
}

export function getNodeWet(EventTargetWet: IMockEventTargetConstructor): IMockNodeConstructor {
  const wetMarker = {
    marker: "true"
  };

  class NodeWet extends EventTargetWet implements IMockNode {
    childNodes: any[] = [];
    wetMarker: IWetMarker;

    constructor(public ownerDocument: any) {
      super();
      this.parentNode = null;
      this.wetMarker = wetMarker;
    }

    insertBefore(newChild: IMockNode, refChild: IMockNode) {
      if (!(newChild instanceof NodeWet)) {
        throw new Error("insertBefore expects a Node!");
      }
      if (refChild !== null && !(refChild instanceof NodeWet)) {
        throw new Error("insertBefore's refChild must be null or a Node!");
      }

      var index;
      if (refChild) {
        index = this.childNodes.indexOf(refChild);
      } else {
        index = this.childNodes.length;
      }

      if (index >= 0) {
        this.childNodes.splice(index, 0, newChild);
        newChild.parentNode = this;
        return newChild;
      }

      throw new Error("refChild is not a child of this node!");
    }

    get firstChild() {
      if (this.childNodes.length > 0) {
        return this.childNodes[0];
      }
      return null;
    }

    shouldNotBeAmongKeys = false;

    nodeType!: any;
  }

  Object.defineProperties(NodeWet.prototype, {
    childNodes: NOT_IMPLEMENTED_DESC,
    nodeType: NOT_IMPLEMENTED_DESC,
    parentNode: NOT_IMPLEMENTED_DESC
  });

  return NodeWet;
}
