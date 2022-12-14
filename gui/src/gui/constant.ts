import visualElements from "../assets/viselements.json";
import { getBlockElementList, getControlElementList, getElementList, getElementProperties, getOnFunctionList } from "./utils";

// object of all elements each with all of its properties
const defaultElementProperties = getElementProperties(visualElements);

// Include control and block elements
const defaultElementList = getElementList(visualElements);

const defaultControlElementList = getControlElementList(visualElements);

const defaultBlockElementList = getBlockElementList(visualElements);

const defaultOnFunctionList = getOnFunctionList(defaultElementProperties);

export {
    defaultElementProperties,
    defaultElementList,
    defaultControlElementList,
    defaultBlockElementList,
    defaultOnFunctionList,
};
