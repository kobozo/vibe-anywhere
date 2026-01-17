# API Development Patterns

## Next.js 15 Route Handler
```typescript
interface RouteContext {
  params: Promise<{ id: string }>;  // Async in Next.js 15!
}

export const GET = withErrorHandling(async (request: NextRequest, context: unknown) => {
  const user = await requireAuth(request);
  const { id } = await (context as RouteContext).params;  // Must await
  
  const resource = await service.get(id);
  if (!resource) throw new NotFoundError('Resource', id);
  
  return successResponse({ resource });
});
```

## Zod Validation
```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  count: z.number().int().min(0),
});

const result = schema.safeParse(body);
if (!result.success) {
  throw new ValidationError('Invalid input', result.error.flatten());
}
```

## Drizzle Queries
```typescript
// Select
const [item] = await db.select().from(table).where(eq(table.id, id));

// Insert
const [created] = await db.insert(table).values({ ...data }).returning();

// Update (ALWAYS use sql`NOW()` for timestamps!)
const [updated] = await db.update(table).set({
  name: 'New Name',
  updatedAt: sql`NOW()`,  // ✅ Correct
}).where(eq(table.id, id)).returning();
```
