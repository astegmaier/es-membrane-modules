import { DAMP } from "./dampSymbol";
import assert from "./assert";
import { getNodeWet, type INodeWet } from "./wetDocument/getNodeWet";
import { getElementWet, type IElementWet } from "./wetDocument/getElementWet";
import { getWetDocument, type IWetDocument } from "./wetDocument/getWetDocument";

import { Membrane, type ObjectGraphHandler, type ILogger } from "../src";

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface IMocks {
  wet: {
    doc: IWetDocument;
    Node: INodeWet;
    Element: IElementWet;
  };
  dry: {
    doc: IWetDocument;
    Node: INodeWet;
    Element: INodeWet;
  };
  handlers: {
    dry: ObjectGraphHandler;
    wet: ObjectGraphHandler;
  };
  membrane: Membrane;
}

export interface IMockOptions {
  wetHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
  dryHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
  dampHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
}

export function MembraneMocks(
  includeDamp: boolean,
  logger: ILogger,
  mockOptions: IMockOptions
): IMocks {
  includeDamp = Boolean(includeDamp);
  if (!mockOptions) {
    mockOptions = {};
  }

  const Mocks: DeepPartial<IMocks> = {};

  //////////////////////////////////////////
  // Originally from mocks/wetDocument.js //
  //////////////////////////////////////////

  const NodeWet = getNodeWet();
  const ElementWet = getElementWet(NodeWet);
  const wetDocument = getWetDocument(NodeWet, ElementWet);

  Mocks.wet = {
    doc: wetDocument,
    Node: NodeWet,
    Element: ElementWet
  };

  ///////////////////////////////////////
  // Originally from mocks/membrane.js //
  ///////////////////////////////////////

  // First, set up the membrane, and register the "wet" form of "the document".
  let wetHandler: ObjectGraphHandler;
  const dryWetMB = new Membrane({
    showGraphName: true,
    logger: typeof logger == "object" ? logger : null
  });

  Mocks.membrane = dryWetMB;
  Mocks.handlers = {};

  {
    // Establish "wet" view of document.
    wetHandler = dryWetMB.getHandlerByName("wet", { mustCreate: true });
    Mocks.handlers.wet = wetHandler;
    // Mocks.wet is established in wetDocument.js

    if (typeof mockOptions.wetHandlerCreated == "function") {
      mockOptions.wetHandlerCreated(wetHandler, Mocks as IMocks);
    }
  }

  //////////////////////////////////////////
  // Originally from mocks/dryDocument.js //
  //////////////////////////////////////////

  // The "dry" part of the membrane's wet document.
  var ElementDry, NodeDry, dryDocument;
  {
    // Establish proxy handler for "dry" mode.
    let dryHandler = dryWetMB.getHandlerByName("dry", { mustCreate: true });
    Mocks.handlers.dry = dryHandler;
    Mocks.dry = {};

    if (typeof mockOptions.dryHandlerCreated == "function") {
      mockOptions.dryHandlerCreated(dryHandler, Mocks as IMocks);
    }

    let found, doc;

    dryWetMB.convertArgumentToProxy(wetHandler, dryHandler, wetDocument);

    [found, doc] = dryWetMB.getMembraneValue("dry", wetDocument);
    assert(found, "Must find dryDocument from membrane wrapping of wetDocument");
    assert(doc === wetDocument, "Expected to get back the wet document");

    [found, doc] = dryWetMB.getMembraneProxy("dry", wetDocument);
    assert(found, "Must find dryDocument from membrane wrapping of wetDocument");
    assert(doc, "Expected to get back a proxy");
    assert(doc !== wetDocument, "Expected to get back the proxy for the wet document");
    dryDocument = doc;

    dryDocument.addEventListener(
      "unload",
      function () {
        if (typeof logger == "object" && logger !== null) {
          logger.debug("Revoking all proxies in dry object graph");
        }
        dryHandler.revokeEverything();
        if (typeof logger == "object" && logger !== null) {
          logger.debug("Revoked all proxies in dry object graph");
        }
      },
      true
    );

    Mocks.dry.doc = dryDocument;
  }

  {
    let dryHandler = dryWetMB.getHandlerByName("dry");
    dryWetMB.convertArgumentToProxy(wetHandler, dryHandler, ElementWet);
    let found;
    [found, ElementDry] = dryWetMB.getMembraneProxy("dry", ElementWet);
    assert(found, "ElementDry not found as a proxy!");

    Mocks.dry.Element = ElementDry;
  }

  {
    let dryHandler = dryWetMB.getHandlerByName("dry");
    dryWetMB.convertArgumentToProxy(wetHandler, dryHandler, NodeWet);
    let found;
    [found, NodeDry] = dryWetMB.getMembraneProxy("dry", NodeWet);
    assert(found, "NodeDry not found as a proxy!");

    Mocks.dry.Node = NodeDry;
  }

  //////////////////////////////////////////////
  // Originally from mocks/dampObjectGraph.js //
  //////////////////////////////////////////////

  function dampObjectGraph(parts) {
    parts.handlers[DAMP] = parts.membrane.getHandlerByName(DAMP, {
      mustCreate: true
    });

    if (typeof mockOptions.dampHandlerCreated == "function") {
      mockOptions.dampHandlerCreated(parts.handlers[DAMP], parts);
    }

    let keys = Object.getOwnPropertyNames(parts.wet);
    parts[DAMP] = {};
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      parts[DAMP][key] = parts.membrane.convertArgumentToProxy(
        parts.handlers.wet,
        parts.handlers[DAMP],
        parts.wet[key]
      );
    }
  }

  /////////////////////////////////////
  // Originally from mocks/return.js //
  /////////////////////////////////////

  // The bare essentials.
  /*
  var Mocks = {
    wet: {
      doc: wetDocument,
      Node: NodeWet,
      Element: ElementWet,
    },
    dry: {
      doc: dryDocument,
      Node: NodeDry,
      Element: ElementDry,
    },

    membrane: dryWetMB
  };
  */

  if (includeDamp) {
    dampObjectGraph(Mocks);
  }

  return Mocks as IMocks;
}
