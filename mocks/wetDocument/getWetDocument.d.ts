import { IEventTarget } from "./EventTargetWet";
import { IElement } from "./getElementWet";
import { INode } from "./getNodeWet";

interface IDocument extends IEventTarget {
  [key: string]: any;
  ownerDocument: any;
  childNodes: any[];
  nodeType: number;
  nodeName: string;
  parentNode: any;
  firstChild: any;
  baseUrl: string;
  shouldNotBeAmongKeys: boolean;
  membraneGraphName: string;
  createElement(name: string): IElement;
  insertBefore(newChild: INode, refChild: INode): INode;
  rootElement: IElement;
}

export function getWetDocument(NodeWet: INode, ElementWet: IElement): IDocument;
