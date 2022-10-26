import { JsonMap } from "@iarna/toml";
import Ajv, { Schema, SchemaObject, ValidateFunction } from "ajv/dist/2020";

let validationSchema: Schema;
export const getValidationSchema = async () => {
  if (!validationSchema) {
    validationSchema = await import("../../schemas/taipy.schema.json");
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
  if (!props.length) {
    const schema = (await getValidationSchema()) as SchemaObject;
    Object.values(schema.properties).forEach((v: any) => {
      v.properties && addPropEnums(v.properties);
      v.additionalProperties?.properties && addPropEnums(v.additionalProperties.properties);
    });
  }
  return props;
};

const addPropEnums = (properties: any) => {
  properties &&
    Object.entries(properties)
      .filter(([_, p]) => (p as any).enum)
      .forEach(([property, p]) => {
        enums[property] = ((p as any).enum as string[]).filter((v) => v).map((v) => v);
      });
};
