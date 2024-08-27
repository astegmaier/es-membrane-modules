import assert from "./assert";
import type { DAMP } from "./dampSymbol";
import { EventTargetWet } from "./wetDocument/EventTargetWet";
import { getNodeWet, type IMockNodeConstructor } from "./wetDocument/getNodeWet";
import { getElementWet, type IMockElementConstructor } from "./wetDocument/getElementWet";
import { getWetDocument, type IDocument } from "./wetDocument/getWetDocument";
import { dampObjectGraph } from "./dampObjectGraph";

import { Membrane, type ObjectGraphHandler, type ILogger } from "../src";

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface IMocks {
  wet: {
    [key: string]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  dry: {
    [key: string]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  [DAMP]?: {
    [key: string]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  handlers: {
    dry: ObjectGraphHandler;
    wet: ObjectGraphHandler;
    [DAMP]?: ObjectGraphHandler;
  };
  membrane: Membrane;
}

export interface IMockOptions {
  wetHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
  dryHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
  dampHandlerCreated?: (handler: ObjectGraphHandler, mocks: IMocks) => void;
}

export function MembraneMocks(
  includeDamp?: boolean,
  logger?: ILogger,
  mockOptions?: IMockOptions
): IMocks {
  includeDamp = Boolean(includeDamp);
  if (!mockOptions) {
    mockOptions = {};
  }

  const Mocks: DeepPartial<IMocks> = {};

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
  let ElementDry, NodeDry, dryDocument;
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
    dampObjectGraph(Mocks as IMocks, mockOptions);
  }

  return Mocks as IMocks;
}
