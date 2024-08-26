import assert from "../assert";
import { EventTargetWet } from "./EventTargetWet";

export function getWetDocument(NodeWet, ElementWet) {
  // A sample object for developing the Membrane module with.

  /* XXX ajvincent Don't make this object inherit from any prototypes.
   * Instead, test prototype inheritance through ElementWet.
   */
  const wetDocument = {
    ownerDocument: null,

    childNodes: [],
    nodeType: 9,
    nodeName: "#document",
    parentNode: null,

    get firstChild() {
      if (this.childNodes.length > 0) {
        return this.childNodes[0];
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
    value: function (name) {
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
    value: function (newChild, refChild) {
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
    value: wetDocument.createElement("root"),
    writable: false,
    enumerable: true,
    // "non-configurable objects cannot gain or lose properties"
    configurable: true
  });

  assert(
    wetDocument.rootElement.ownerDocument == wetDocument,
    "wetDocument cyclic reference isn't correct"
  );

  return wetDocument;
}
