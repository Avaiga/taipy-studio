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
    v.properties && addPropEnums(v.properties);
    v.additionalProperties?.properties && addPropEnums(v.additionalProperties.properties);
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
  const props = Object.keys(properties);
  if (!props.length) {
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.entries(schema.properties).forEach(([k, v]: [string, any]) => {
      properties[k] = Object.keys(v.properties);
      properties[k].push(...Object.keys(v.additionalProperties?.properties || {}));
    });
  }
  return properties[nodeType] || [];
}
