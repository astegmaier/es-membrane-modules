type EventHandler = (...args: unknown[]) => void;

interface IListener {
  handleEvent: EventHandler;
}

interface IEvent {
  type: any;
  listener: IListener;
  isBubbling: boolean;
}

export interface IMockEventTarget {
  __events__: IEvent[];
  parentNode?: IMockEventTarget | null;
  addEventListener(type: any, listener: EventHandler | IListener, isBubbling: boolean): void;
  dispatchEvent(eventType: any): void;
  handleEventAtTarget(eventType: any): void;
}

export interface IMockEventTargetConstructor {
  new (): IMockEventTarget;
}

export class EventTargetWet implements IMockEventTarget {
  parentNode?: IMockEventTarget | null;

  __events__: IEvent[] = [];

  addEventListener(type: any, listener: EventHandler | IListener, isBubbling: boolean) {
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
  }

  dispatchEvent(eventType: any) {
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
      chain[i]!.handleEventAtTarget(event);
    }

    event.currentPhase = 2;
    this.handleEventAtTarget(event);

    chain = chain.reverse();
    event.currentPhase = 3;
    for (let i = 0; i < chain.length; i++) {
      chain[i]!.handleEventAtTarget(event);
    }
  }

  handleEventAtTarget(event: any) {
    let handlers = this.__events__.slice(0);
    let length = handlers.length;
    for (let i = 0; i < length; i++) {
      let h = handlers[i]!;
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
  }
}
