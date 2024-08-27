import type { ObjectGraphHandler } from "../src";

import { DAMP } from "./dampSymbol";
import type { IMockOptions, IMocks } from "./MembraneMocks";
import type { IMockElementConstructor } from "./wetDocument/getElementWet";
import type { IMockNodeConstructor } from "./wetDocument/getNodeWet";
import type { IDocument } from "./wetDocument/getWetDocument";

export interface IDampMocks {
  [DAMP]: {
    [key: string | symbol]: any;
    doc: IDocument;
    Node: IMockNodeConstructor;
    Element: IMockElementConstructor;
  };
  handlers: { [DAMP]: ObjectGraphHandler };
}

export function dampObjectGraph(parts: IMocks, mockOptions: IMockOptions): void {
  let partsWithDamp = parts as IMocks & IDampMocks;
  partsWithDamp.handlers[DAMP] = parts.membrane.getHandlerByName(DAMP, {
    mustCreate: true
  });

  if (typeof mockOptions.dampHandlerCreated == "function") {
    mockOptions.dampHandlerCreated(partsWithDamp.handlers[DAMP], parts);
  }

  let keys = Object.getOwnPropertyNames(parts.wet);
  const dampParts = {} as IDampMocks[typeof DAMP];
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]!;
    dampParts![key] = parts.membrane.convertArgumentToProxy(
      parts.handlers.wet,
      partsWithDamp.handlers[DAMP],
      parts.wet[key]
    );
  }
  partsWithDamp[DAMP] = dampParts!;
}
