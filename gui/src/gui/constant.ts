import visualElements from "../assets/viselements.json";
import { getBlockElementList, getControlElementList, getElementList, getElementProperties, getOnFunctionList, getOnFunctionSignature } from "./utils";

// object of all elements each with all of its properties
export const defaultElementProperties = getElementProperties(visualElements);

// Include control and block elements
export const defaultElementList = getElementList(visualElements);

export const defaultControlElementList = getControlElementList(visualElements);

export const defaultBlockElementList = getBlockElementList(visualElements);

export const defaultOnFunctionList = getOnFunctionList(defaultElementProperties);

export const defaultOnFunctionSignature = getOnFunctionSignature(defaultElementProperties);

export enum LanguageId {
    py = "python",
    md = "markdown",
}
