interface IListener {
  handleEvent: (...args: unknown[]) => void;
}

interface IEvent {
  type: any;
  listener: IListener;
  isBubbling: boolean;
}

interface IEventTargetOwn {
  __events__: IEvent[];
  parentNode: any;
}

interface IEventTargetPrototype {
  addEventListener(type: any, listener: (...args: unknown[]) => void, isBubbling: boolean): void;
  dispatchEvent(eventType: any): void;
  handleEventAtTarget(eventType: any): void;
}

export interface IEventTarget extends IEventTargetOwn, IEventTargetPrototype {}

export interface EventTargetWet extends IEventTarget {}

export class EventTargetWet {}
