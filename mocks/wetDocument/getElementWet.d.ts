import { INodeWet } from "./getNodeWet";

interface IElementWet extends INodeWet {
  new (ownerDoc: any, name: any);
  nodeType: 1;
  nodeName: string;
}

export function getElementWet(NodeWet: INodeWet): IElementWet;
