interface IListener {
  handleEvent: (...args: unknown[]) => void;
}

interface IEvent {
  type: any;
  listener: IListener;
  isBubbling: boolean;
}

export interface IEventTargetWetOwn {
  __events__: IEvent[];
  parentNode: any;
}

export interface IEventTargetWetPrototype {
  addEventListener(type: any, listener: (...args: unknown[]) => void, isBubbling: boolean): void;
  dispatchEvent(eventType: any): void;
  handleEventAtTarget(eventType: any): void;
}

export interface IEventTargetWet extends IEventTargetWetOwn, IEventTargetWetPrototype {}

export interface EventTargetWet extends IEventTargetWet {}

export class EventTargetWet {}
