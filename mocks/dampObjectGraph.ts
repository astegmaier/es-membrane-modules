import { DAMP } from "./dampSymbol";
import type { IMockOptions, IMocks } from "./MembraneMocks";

export function dampObjectGraph(parts: IMocks, mockOptions: IMockOptions) {
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
