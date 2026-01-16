import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Get DATABASE_URL from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// CRITICAL: Define custom date/timestamp parsers for postgres-js
// By default, postgres-js returns timestamps as strings
// We need Date objects for Drizzle's { mode: 'date' } to work
const dateParser = {
  to: 1184,  // timestamptz OID
  from: [1082, 1083, 1114, 1184],  // date, time, timestamp, timestamptz
  serialize: (x: any) => {
    if (x === null || x === undefined) return null;
    if (x instanceof Date) return x.toISOString();
    if (typeof x === 'string') return new Date(x).toISOString();
    return String(x);
  },
  parse: (x: any) => {
    if (x === null || x === undefined) return null;
    return new Date(x);
  },
};

// Create PostgreSQL connection with connection pooling
console.log('[DB] Initializing postgres-js connection with custom date parser');
const queryClient = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: {
    undefined: null,
  },
  types: {
    date: dateParser,
  },
});

// Create Drizzle instance
const drizzleDb = drizzle(queryClient, { schema });

// WORKAROUND: Wrap Drizzle to ensure timestamp fields are Date objects before UPDATE/INSERT
// This handles cases where objects might have been JSON-serialized and dates became strings
function ensureDateFields<T extends Record<string, any>>(data: T): T {
  const result = { ...data };

  for (const [key, value] of Object.entries(result)) {
    // If value is a string that looks like an ISO date, convert to Date
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const dateValue = new Date(value);
        // Only convert if it's a valid date
        if (!isNaN(dateValue.getTime())) {
          (result as any)[key] = dateValue;
        }
      } catch (e) {
        // Not a valid date, leave as-is
      }
    }
  }

  return result;
}

// Proxy to intercept update() calls
export const db = new Proxy(drizzleDb, {
  get(target, prop) {
    if (prop === 'update') {
      return (...args: any[]) => {
        const updateBuilder = (target as any).update(...args);
        // Proxy the set() method
        const originalSet = updateBuilder.set.bind(updateBuilder);
        updateBuilder.set = (data: any) => {
          const cleanedData = ensureDateFields(data);
          return originalSet(cleanedData);
        };
        return updateBuilder;
      };
    }
    if (prop === 'insert') {
      return (...args: any[]) => {
        const insertBuilder = (target as any).insert(...args);
        // Proxy the values() method
        const originalValues = insertBuilder.values.bind(insertBuilder);
        insertBuilder.values = (data: any) => {
          const cleanedData = Array.isArray(data)
            ? data.map(ensureDateFields)
            : ensureDateFields(data);
          return originalValues(cleanedData);
        };
        return insertBuilder;
      };
    }
    return (target as any)[prop];
  }
}) as typeof drizzleDb;

// Export schema
export * from './schema';

// Export queryClient for direct SQL queries (used by SQLite compatibility layer)
export { queryClient };

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await queryClient.end();
}
