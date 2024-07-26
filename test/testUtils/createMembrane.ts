import { Membrane } from "../../src";

export interface CreateMembraneResult<T extends object> {
  membrane: T;
  revoke: () => void;
}

export function createMembrane<T extends object>(target: T): CreateMembraneResult<T> {
  // TODO: Should we have a single membrane instance instance instead of creating a new one each time? If so, should each handler have a unique name (e.g. dry1, wet1, dry2, wet2, instead of just "wet" and "dry")?
  const membrane = new Membrane();

  // TODO: investigate "mustCreate" option. Also, should we re-create a separate dry handlers for each iframe?
  const dryHandler = membrane.getHandlerByName(`dry`, { mustCreate: true });
  const wetHandler = membrane.getHandlerByName(`wet`, { mustCreate: true });

  const proxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, target);

  return {
    membrane: proxy,
    revoke: () => {
      dryHandler.revokeEverything();
      wetHandler.revokeEverything();
    },
  };
}
