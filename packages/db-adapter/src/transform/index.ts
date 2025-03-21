import { BetterAuthError } from "better-auth";
import { getAuthTables } from "better-auth/db";
import type { BetterAuthOptions, Where } from "better-auth";
import type { CollectionSlug, Where as PayloadWhere } from "payload";

export const createTransform = (
  options: BetterAuthOptions,
  enableDebugLogs: boolean
) => {
  const schema = getAuthTables(options);

  function debugLog(message: any[]) {
    if (enableDebugLogs) {
      console.log(`[payload-db-adapter]`, ...message);
    }
  }

  function getField(model: string, field: string) {
    if (field === "id") {
      return field;
    }
    const f = (schema as Record<string, any>)[model]?.fields[field];
    const fieldName = f?.fieldName || field;
    debugLog(["getField: ", model, fieldName]);
    return fieldName;
  }

  function getModelName(model: string): CollectionSlug {
    const collection =
      (schema as Record<string, any>)[model]?.modelName || model;
    if (!collection) {
      throw new BetterAuthError(
        `Model ${model} does not exist in the database.`
      );
    }
    return collection as CollectionSlug;
  }

  function singleIdQuery(where: PayloadWhere) {
    if (!where || "and" in where || "or" in where) return null;

    // For a single id query like { id: { equals: 15 } }
    // First, check if there's an id field in the where clause
    if ("id" in where || "_id" in where) {
      const idField = "id" in where ? "id" : "_id";
      const condition = where[idField];

      // Check if condition is an object with equals operator
      if (
        condition &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        "equals" in condition
      ) {
        const value = condition.equals;
        if (typeof value === "string" || typeof value === "number") {
          return value;
        }
      }

      // Check for contains operator with single value
      if (
        condition &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        "contains" in condition &&
        Array.isArray(condition.contains) &&
        condition.contains.length === 1
      ) {
        const value = condition.contains[0];
        if (typeof value === "string" || typeof value === "number") {
          return value;
        }
      }
    }

    return null;
  }

  function multipleIdsQuery(where: PayloadWhere) {
    if (!where || "and" in where || "or" in where) return null;
    if ("id" in where || "_id" in where) {
      const idField = "id" in where ? "id" : "_id";
      const condition = where[idField];

      // Check if this is an 'in' operator with id field and array of values
      if (
        condition &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        "in" in condition &&
        Array.isArray(condition.in) &&
        condition.in.length > 1 &&
        condition.in.every(
          (id: unknown) => typeof id === "string" || typeof id === "number"
        )
      ) {
        return condition.in as (number | string)[];
      }

      // Also check for contains operator with array of IDs
      if (
        condition &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        "contains" in condition &&
        Array.isArray(condition.contains) &&
        condition.contains.length > 1 &&
        condition.contains.every(
          (id: unknown) => typeof id === "string" || typeof id === "number"
        )
      ) {
        return condition.contains as (number | string)[];
      }
    }

    return null;
  }

  function transformInput(
    data: Record<string, any>,
    model: string,
    action: "create" | "update"
  ) {
    const transformedData: Record<string, any> = {};
    const schemaFields = (schema as Record<string, any>)[model].fields;
    for (const dataField in data) {
      if (data[dataField] === undefined && action === "update") {
        continue;
      }
      const updatedFieldName = schemaFields[dataField]?.fieldName;

      if (updatedFieldName) {
        if (
          schemaFields[dataField].type === "string" &&
          typeof data[dataField] === "number" &&
          updatedFieldName.endsWith("Id")
        ) {
          debugLog([
            "Incoming data is typeof number but stored as typeof string",
            dataField,
            data[dataField].toString(),
          ]);
          transformedData[updatedFieldName] = data[dataField].toString();
        } else {
          transformedData[updatedFieldName] = data[dataField];
        }
      } else {
        transformedData[dataField] = data[dataField];
      }
    }

    return transformedData;
  }

  function transformOutput<T extends Record<string, any> | undefined>(
    doc: T
  ): T {
    if (!doc || typeof doc !== "object") return doc;

    const result = { ...doc } as any;

    // Scan for relationship fields that contain objects with IDs
    Object.entries(doc).forEach(([key, value]) => {
      // If the value is an object with an id property, it's likely a relationship
      if (value && typeof value === "object" && "id" in value) {
        // Create a new field with Id suffix containing just the ID
        const newKey = `${key}Id`;
        result[newKey] = value.id;

        //also remove the object and just keep the id
        result[key] = value.id;

        // Keep the original value as well for backward compatibility
      } else if (Array.isArray(value)) {
        // Handle arrays of relationships
        if (
          value.length > 0 &&
          typeof value[0] === "object" &&
          "id" in value[0]
        ) {
          const newKey = `${key}Ids`;
          result[newKey] = value.map((item) => item.id);

          //also remove the object and just keep the id
          result[key] = value.map((item) => item.id);
        }
      }
    });

    // Scan for date fields and convert them to Date objects
    Object.entries(result).forEach(([key, value]) => {
      // Check if the field is a date string (ISO format)
      if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
      ) {
        result[key] = new Date(value);
      } else if (
        // Also check for date-like field names
        (key.endsWith("At") || key.endsWith("Date") || key === "date") &&
        typeof value === "string" &&
        !isNaN(Date.parse(value))
      ) {
        result[key] = new Date(value);
      }
    });

    return result as T;
  }

  function operatorToPayload(operator: string, value: any) {
    switch (operator) {
      case "eq":
        return { equals: value };
      case "ne":
        return { not_equals: value };
      case "gt":
        return { greater_than: value };
      case "gte":
        return { greater_than_equal: value };
      case "lt":
        return { less_than: value };
      case "lte":
        return { less_than_equal: value };
      case "contains":
        return { contains: value };
      case "in":
        return { in: value };
      case "starts_with":
        return { like: `${value}%` };
      case "ends_with":
        return { like: `%${value}` };
      default:
        return { equals: value };
    }
  }

  function convertWhereValue(value: any, field: string) {
    if (field === "id" || field === "_id") {
      if (typeof value === "object") {
        return value.id;
      }
      return value;
    }
    return value;
  }

  function convertWhereClause(model: string, where?: Where[]): PayloadWhere {
    if (!where) return {};
    if (where.length === 1) {
      const w = where[0];
      if (!w) {
        return {};
      }

      const field = getField(model, w.field);
      const value = convertWhereValue(w.value, field);

      const res = {
        [field]: operatorToPayload(w.operator ?? "", value),
      };

      return res;
    }
    const and = where.filter((w) => w.connector === "AND" || !w.connector);
    const or = where.filter((w) => w.connector === "OR");
    const andClause = and.map((w) => {
      const field = getField(model, w.field);
      const value = convertWhereValue(w.value, field);
      return {
        [field]: operatorToPayload(w.operator ?? "", value),
      };
    });
    const orClause = or.map((w) => {
      const field = getField(model, w.field);
      const value = convertWhereValue(w.value, field);
      return {
        [field]: operatorToPayload(w.operator ?? "", value),
      };
    });

    return {
      ...(andClause.length ? { AND: andClause } : {}),
      ...(orClause.length ? { OR: orClause } : {}),
    };
  }

  function convertSelect(model: string, select?: string[]) {
    if (!select || select.length === 0) return undefined;
    return select.reduce(
      (acc, field) => ({ ...acc, [getField(model, field)]: true }),
      {}
    );
  }

  function convertSort(
    model: string,
    sortBy?: { field: string; direction: "asc" | "desc" }
  ) {
    if (!sortBy) return undefined;
    return `${sortBy.direction === "desc" ? "-" : ""}${getField(
      model,
      sortBy.field
    )}`;
  }

  return {
    getField,
    getModelName,
    singleIdQuery,
    multipleIdsQuery,
    transformInput,
    transformOutput,
    convertWhereClause,
    convertSelect,
    convertSort,
  };
};
