import { JsonMap } from "@iarna/toml";
import Ajv, { Schema, SchemaObject, ValidateFunction } from "ajv/dist/2020";

let validationSchema: Schema;
export const getValidationSchema = async () => {
  if (!validationSchema) {
    validationSchema = await import("../../schemas/config.schema.json");
  }
  return validationSchema;
};

let validationFunction: ValidateFunction<JsonMap>;
export const getValidationFunction = async () => {
  if (!validationFunction) {
    const schema = await getValidationSchema();
    const ajv = new Ajv({ strictTypes: false, allErrors: true, allowUnionTypes: true });
    validationFunction = ajv.compile<JsonMap>(schema);
  }
  return validationFunction;
};

const enums = {} as Record<string, string[]>;
export const getEnum = (property: string) => enums[property];

export const getEnumProps = async () => {
  const props = Object.keys(enums);
  if (props.length) {
    return props;
  }
  const schema = (await getValidationSchema()) as SchemaObject;
  Object.values(schema.properties).forEach((v: any) => {
    addPropEnums(v.properties);
    addPropEnums(v.additionalProperties?.properties);
  });
  return Object.keys(enums);
};

const addPropEnums = (properties: any) => {
  properties &&
    Object.entries(properties)
      .filter(([_, p]) => (p as any).enum)
      .forEach(([property, p]) => {
        enums[property] = ((p as any).enum as string[]).filter((v) => v).map((v) => v);
      });
};

const properties = {} as Record<string, string[]>;
export const getProperties = async (nodeType: string) => {
  if (!Object.keys(properties).length) {
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.entries(schema.properties).forEach(([k, v]: [string, any]) => {
      properties[k] = Object.keys(v.properties);
      properties[k].push(...Object.keys(v.additionalProperties?.properties || {}).filter((p) => p && p !== "if" && p !== "then" && p !== "else"));
    });
  }
  return properties[nodeType] || [];
};

let functions: string[] = undefined;
let classes: string[] = undefined;
export const calculatePythonSymbols = async () => {
  if (functions === undefined) {
    functions = [];
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.values(schema.properties).forEach((v: any) => {
      functions.push(
        ...Object.entries(v.properties)
          .filter(([_, v]) => !!(v as any).taipy_function)
          .map(([k, _]) => k)
      );
      functions.push(
        ...Object.entries(v.additionalProperties?.properties || {})
          .filter(([_, v]) => !!(v as any).taipy_function)
          .map(([k, _]) => k)
      );
    });
  }
  if (classes === undefined) {
    classes = [];
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.values(schema.properties).forEach((v: any) => {
      classes.push(
        ...Object.entries(v.properties)
          .filter(([_, v]) => !!(v as any).taipy_class)
          .map(([k, _]) => k)
      );
      classes.push(
        ...Object.entries(v.additionalProperties?.properties || {})
          .filter(([_, v]) => !!(v as any).taipy_class)
          .map(([k, _]) => k)
      );
    });
  }
};
export const isFunction = (property: string) => functions?.includes(property);
export const isClass = (property: string) => classes?.includes(property);

const pythonReferences = {} as Record<string, Record<string, boolean>>;
export const getPythonReferences = async () => {
  if (!Object.keys(pythonReferences).length) {
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.entries(schema.properties).forEach(([nodeType, node]: [string, any]) => {
      pythonReferences[nodeType] = {};
      Object.entries(node.properties).forEach(([prop, v]) => {
        if (!!(v as any).taipy_function || !!(v as any).taipy_class) {
          pythonReferences[nodeType] = pythonReferences[nodeType] || {};
          pythonReferences[nodeType][prop] = !!(v as any).taipy_function;
        }
      });
      Object.entries(node.additionalProperties?.properties || {}).forEach(([prop, v]) => {
        if (!!(v as any).taipy_function || !!(v as any).taipy_class) {
          pythonReferences[nodeType] = pythonReferences[nodeType] || {};
          pythonReferences[nodeType][prop] = !!(v as any).taipy_function;
        }
      });
    });
  }
  return pythonReferences;
};
