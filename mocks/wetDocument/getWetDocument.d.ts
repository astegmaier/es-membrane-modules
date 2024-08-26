import { IEventTargetWet } from "./EventTargetWet";
import { IElementWet } from "./getElementWet";
import { INodeWet } from "./getNodeWet";

interface IWetDocument extends IEventTargetWet {
  ownerDocument: any;
  childNodes: any[];
  nodeType: number;
  nodeName: string;
  parentNode: any;
  firstChild: any;
  baseUrl: string;
  shouldNotBeAmongKeys: boolean;
  membraneGraphName: string;
  createElement(name: string): IElementWet;
  insertBefore(newChild: INodeWet, refChild: INodeWet): INodeWet;
  rootElement: IElementWet;
}

export function getWetDocument(NodeWet: INodeWet, ElementWet: IElementWet): IWetDocument;
