import { Membrane } from "../../src";

export interface CreateMembraneResult<T extends object> {
  proxy: T;
  revoke: () => void;
}

export function createMembraneProxy<T extends object>(target: T): CreateMembraneResult<T> {
  const membrane = new Membrane();

  const dryHandler = membrane.getHandlerByName(`dry`, { mustCreate: true });
  const wetHandler = membrane.getHandlerByName(`wet`, { mustCreate: true });

  const proxy = membrane.convertArgumentToProxy(wetHandler, dryHandler, target);

  return {
    proxy,
    revoke: () => {
      dryHandler.revokeEverything();
      wetHandler.revokeEverything();
    }
  };
}
