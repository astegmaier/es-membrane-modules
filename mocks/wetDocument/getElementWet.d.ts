import { INode } from "./getNodeWet";

export interface IElement extends INode {
  new (ownerDoc: any, name: any);
  nodeType: 1;
  nodeName: string;
}

export function getElementWet(NodeWet: INode): IElement;
