import { timestamp as drizzleTimestamp, type PgTimestampConfig } from 'drizzle-orm/pg-core';
import type { ColumnBuilderBaseConfig } from 'drizzle-orm';

/**
 * Custom timestamp column that safely handles both Date objects and ISO strings
 * This is a workaround for postgres-js returning strings while Drizzle expects Dates
 */
export function timestamp(
  name: string,
  config?: PgTimestampConfig
) {
  const col = drizzleTimestamp(name, config);

  // Override the mapToDriverValue method to handle both strings and Dates
  const originalMapToDriverValue = (col as any).mapToDriverValue;
  (col as any).mapToDriverValue = function (value: any) {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return null;
    }

    // If it's already a Date object, use original behavior
    if (value instanceof Date) {
      return originalMapToDriverValue ? originalMapToDriverValue.call(this, value) : value.toISOString();
    }

    // If it's a string that looks like an ISO date, convert to Date first
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const dateValue = new Date(value);
        if (!isNaN(dateValue.getTime())) {
          return originalMapToDriverValue ? originalMapToDriverValue.call(this, dateValue) : dateValue.toISOString();
        }
      } catch (e) {
        // Fall through to error
      }
    }

    // If we get here with a non-Date, non-string value, try to use original behavior
    // This will likely throw an error, but at least we tried
    return originalMapToDriverValue ? originalMapToDriverValue.call(this, value) : String(value);
  };

  return col;
}
