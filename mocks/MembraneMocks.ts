import assert from "./assert";
import { EventTargetWet } from "./wetDocument/EventTargetWet";
import { getNodeWet, type IMockNodeConstructor } from "./wetDocument/getNodeWet";
import { getElementWet, type IMockElementConstructor } from "./wetDocument/getElementWet";
import { getWetDocument, type IDocument } from "./wetDocument/getWetDocument";
import { dampObjectGraph, type IDampMocks } from "./dampObjectGraph";

import { Membrane, type ObjectGraphHandler, type ILogger } from "../src";

export interface IMocks {
  wet: {
    [key: string | symbol]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  dry: {
    [key: string | symbol]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  handlers: {
    dry: ObjectGraphHandler;
    wet: ObjectGraphHandler;
  };
  membrane: Membrane;
}

export interface IMockOptions<Mocks extends IMocks = IMocks> {
  wetHandlerCreated?: (handler: ObjectGraphHandler, mocks: Mocks) => void;
  dryHandlerCreated?: (handler: ObjectGraphHandler, mocks: Mocks) => void;
  dampHandlerCreated?: (handler: ObjectGraphHandler, mocks: Mocks) => void;
}

export function MembraneMocks(
  includeDamp?: false,
  logger?: ILogger | null,
  mockOptions?: IMockOptions
): IMocks;
export function MembraneMocks(
  includeDamp: true,
  logger?: ILogger | null,
  mockOptions?: IMockOptions<IMocks & IDampMocks>
): IMocks & IDampMocks;
export function MembraneMocks(
  includeDamp?: boolean,
  logger?: ILogger | null,
  mockOptions?: IMockOptions<IMocks & IDampMocks>
): IMocks & IDampMocks {
  includeDamp = Boolean(includeDamp);
  if (!mockOptions) {
    mockOptions = {};
  }

  const Mocks = {} as IMocks & IDampMocks;

  //////////////////////////////////////////
  // Originally from mocks/wetDocument.js //
  //////////////////////////////////////////

  const NodeWet = getNodeWet(EventTargetWet);
  const ElementWet = getElementWet(NodeWet);
  const wetDocument = getWetDocument(NodeWet, ElementWet, EventTargetWet);

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
  Mocks.handlers = {} as (IMocks & IDampMocks)["handlers"];

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
  let ElementDry, NodeDry, dryDocument;
  {
    // Establish proxy handler for "dry" mode.
    let dryHandler = dryWetMB.getHandlerByName("dry", { mustCreate: true });
    Mocks.handlers.dry = dryHandler;
    Mocks.dry = {} as (IMocks & IDampMocks)["dry"];

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
    dampObjectGraph(Mocks, mockOptions);
  }

  return Mocks as IMocks & IDampMocks;
}
