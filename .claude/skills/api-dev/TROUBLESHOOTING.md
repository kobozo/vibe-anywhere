# API Troubleshooting

## "Cannot read property 'id' of undefined"
**Solution**: Forgot to await `context.params` in Next.js 15

## PostgreSQL timestamp errors
**Solution**: Use `sql`NOW()`` instead of `new Date()`

## Validation fails unexpectedly
**Solution**: Check Zod schema matches request structure, use `.safeParse()` for debugging

## 401 Unauthorized
**Solution**: Verify Authorization header includes valid token
