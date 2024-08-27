import assert from "../assert";
import { IMockElement, IMockElementConstructor } from "./getElementWet";
import { IMockNode, IMockNodeConstructor } from "./getNodeWet";
import type { IMockEventTarget, IMockEventTargetConstructor } from "./EventTargetWet";

export interface IDocument extends IMockEventTarget {
  [key: string]: any;
  ownerDocument: any;
  childNodes: any[];
  nodeType: number;
  nodeName: string;
  parentNode: any;
  firstChild: any;
  baseUrl: string;
  shouldNotBeAmongKeys: boolean;
  membraneGraphName: string;
  createElement(name: string): IMockElement;
  insertBefore(newChild: IMockNode, refChild: IMockNode): IMockNode;
  rootElement: IMockElement;
}

export function getWetDocument(
  NodeWet: IMockNodeConstructor,
  ElementWet: IMockElementConstructor,
  EventTargetWet: IMockEventTargetConstructor
) {
  // A sample object for developing the Membrane module with.

  /* XXX ajvincent Don't make this object inherit from any prototypes.
   * Instead, test prototype inheritance through ElementWet.
   */
  const wetDocument: Partial<IDocument> = {
    ownerDocument: null,

    childNodes: [],
    nodeType: 9,
    nodeName: "#document",
    parentNode: null,

    get firstChild() {
      // TODO: revisit type assertion (!)
      if (this.childNodes!.length > 0) {
        // TODO: revisit type assertion (!)
        return this.childNodes![0];
      }
      return null;
    },

    get baseURL() {
      return docBaseURL;
    },
    set baseURL(val) {
      if (typeof val != "string") {
        throw new Error("baseURL must be a string");
      }
      docBaseURL = val;
    },

    // EventListener
    __events__: [],
    addEventListener: EventTargetWet.prototype.addEventListener,
    dispatchEvent: EventTargetWet.prototype.dispatchEvent,
    handleEventAtTarget: EventTargetWet.prototype.handleEventAtTarget,

    shouldNotBeAmongKeys: false,

    membraneGraphName: "wet" // faking it for now
  };

  Object.defineProperty(wetDocument, "createElement", {
    value: function (name: string) {
      if (typeof name != "string") {
        throw new Error("createElement requires name be a string!");
      }
      return new ElementWet(this, name);
    },
    writable: false,
    enumerable: true,
    configurable: true
  });

  Object.defineProperty(wetDocument, "insertBefore", {
    value: function (newChild: IMockNode, refChild: IMockNode) {
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
    },
    writable: false,
    enumerable: true,
    configurable: true
  });
  /* We can get away with a var declaration here because everything is inside a
         closure.
      */
  var docBaseURL = "http://www.example.com/";

  Object.defineProperty(wetDocument, "rootElement", {
    // TODO: revisit type assertion (!)
    value: wetDocument.createElement!("root"),
    writable: false,
    enumerable: true,
    // "non-configurable objects cannot gain or lose properties"
    configurable: true
  });

  assert(
    // TODO: revisit type assertion (!)
    wetDocument.rootElement!.ownerDocument == wetDocument,
    "wetDocument cyclic reference isn't correct"
  );

  return wetDocument;
}
