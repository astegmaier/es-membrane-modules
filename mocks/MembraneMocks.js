import { DAMP } from "./dampSymbol";
import assert from "./assert";
import { getNodeWet } from "./wetDocument/getNodeWet";
import { getElementWet } from "./wetDocument/getElementWet";
import { getWetDocument } from "./wetDocument/getWetDocument";

import { Membrane } from "../src";

export function MembraneMocks(includeDamp, logger, mockOptions) {
  "use strict";
  includeDamp = Boolean(includeDamp);
  if (!mockOptions) {
    mockOptions = {};
  }

  var Mocks = {};

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
  var docMap, wetHandler;
  var dryWetMB = new Membrane({
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
      mockOptions.wetHandlerCreated(wetHandler, Mocks);
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
      mockOptions.dryHandlerCreated(dryHandler, Mocks);
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

  return Mocks;
}
