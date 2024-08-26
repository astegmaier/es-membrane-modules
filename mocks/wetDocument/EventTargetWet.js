export function EventTargetWet() {
  this.__events__ = [];
}

EventTargetWet.prototype.addEventListener = function (type, listener, isBubbling) {
  if (typeof listener == "function") {
    listener = { handleEvent: listener };
  }
  if (
    typeof listener !== "object" ||
    listener === null ||
    typeof listener.handleEvent !== "function"
  ) {
    throw new Error("Invalid event listener!");
  }
  this.__events__.push({
    type: type,
    listener: listener,
    isBubbling: Boolean(isBubbling)
  });
};

EventTargetWet.prototype.dispatchEvent =
  /** @this {import('./EventTargetWet').IEventTarget} */ function (eventType) {
    let current = this.parentNode;
    let chain = [];
    while (current) {
      chain.unshift(current);
      current = current.parentNode;
    }

    let event = {
      type: eventType,
      currentPhase: 1
    };

    for (let i = 0; i < chain.length; i++) {
      chain[i].handleEventAtTarget(event);
    }

    event.currentPhase = 2;
    this.handleEventAtTarget(event);

    chain = chain.reverse();
    event.currentPhase = 3;
    for (let i = 0; i < chain.length; i++) {
      chain[i].handleEventAtTarget(event);
    }
  };

EventTargetWet.prototype.handleEventAtTarget = function (event) {
  let handlers = this.__events__.slice(0);
  let length = handlers.length;
  for (let i = 0; i < length; i++) {
    let h = handlers[i];
    if (h.type !== event.type) {
      continue;
    }
    let hCode = h.isBubbling ? 4 - event.currentPhase : event.currentPhase;
    if (hCode === 3) {
      continue;
    }
    try {
      h.listener.handleEvent(event);
    } catch (e) {
      // do nothing
    }
  }
};
