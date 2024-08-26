export interface INodeWetOwn {
  childNodes: any[];
  ownerDocument: any;
  parentNode: any;
  wetMarker: { marker: string };
}

export interface INodeWetPrototype {
  nodeType: any;
  insertBefore(newChild: INodeWet, refChild: INodeWet): any;
  firstChild: any;
  shouldNotBeAmongKeys: boolean;
}

export interface INodeWet extends INodeWetOwn, INodeWetPrototype {
  new (ownerDoc: any): INodeWet;
}

export function getNodeWet(): INodeWet;
