interface INodeOwn {
  childNodes: any[];
  ownerDocument: any;
  parentNode: any;
  wetMarker: { marker: string };
}

interface INodePrototype {
  nodeType: any;
  insertBefore(newChild: INode, refChild: INode): any;
  firstChild: any;
  shouldNotBeAmongKeys: boolean;
}

export interface INode extends INodeOwn, INodePrototype {
  new (ownerDoc: any): INode;
}

export function getNodeWet(): INode;
