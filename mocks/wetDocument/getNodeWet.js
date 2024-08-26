import {
  AccessorDescriptor,
  DataDescriptor,
  NOT_IMPLEMENTED_DESC
} from "../../src/sharedUtilities";
import { EventTargetWet } from "./EventTargetWet";

export function getNodeWet() {
  const wetMarker = {
    marker: "true"
  };

  function NodeWet(ownerDoc) {
    EventTargetWet.apply(this, arguments); // this takes care of event handling
    Object.defineProperty(this, "childNodes", new DataDescriptor([]));
    Object.defineProperty(this, "ownerDocument", new DataDescriptor(ownerDoc));
    Object.defineProperty(this, "parentNode", new DataDescriptor(null, true));

    // testing the set trap in a constructor properly marks a new non-primitive
    // property in the "wet" object graph.
    this.wetMarker = wetMarker;
  }
  NodeWet.prototype = new EventTargetWet();
  Object.defineProperties(NodeWet.prototype, {
    childNodes: NOT_IMPLEMENTED_DESC,
    nodeType: NOT_IMPLEMENTED_DESC,
    parentNode: NOT_IMPLEMENTED_DESC,
    insertBefore: new DataDescriptor(function (
      /** @type {import('./getNodeWet').INode} */ newChild,
      refChild
    ) {
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
    }),
    firstChild: new AccessorDescriptor(function () {
      if (this.childNodes.length > 0) {
        return this.childNodes[0];
      }
      return null;
    }),

    shouldNotBeAmongKeys: new DataDescriptor(false)
  });
  return NodeWet;
}
