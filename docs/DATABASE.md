# Database Configuration

Vibe Anywhere supports both SQLite and PostgreSQL databases. **SQLite is the default** for zero-configuration setup.

## Quick Start

### SQLite (Default - Recommended for Most Users)

```bash
# Start with SQLite (default)
docker compose up -d

# Run migrations
docker compose exec app npm run db:migrate

# Create a user
docker compose exec app npx tsx scripts/seed-user.ts username password
```

**Benefits:**
- ✅ Zero configuration required
- ✅ No external database needed
- ✅ Perfect for single-server deployments
- ✅ Automatic WAL mode for performance
- ✅ Smaller memory footprint

**Database location:** `/data/app.db` (persisted in Docker volume)

### PostgreSQL (For Multi-Server Scaling)

```bash
# Start with PostgreSQL
docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d

# Run migrations
docker compose exec app npm run db:migrate

# Create a user
docker compose exec app npx tsx scripts/seed-user.ts username password
```

**Benefits:**
- ✅ Better for multi-server deployments
- ✅ Advanced replication features
- ✅ Larger concurrent user support

**Requirements:**
- Set `POSTGRES_PASSWORD` in `.env`
- PostgreSQL container will start automatically

## Configuration Files

### docker-compose.yml (Default - SQLite)
Main configuration file using SQLite by default.

### docker-compose.postgres.yml (Optional)
Add-on file for PostgreSQL support. Only use when needed.

### .env Configuration

```bash
# For SQLite (default)
# DATABASE_URL=

# For PostgreSQL
DATABASE_URL=postgresql://vibeanywhere:yourpassword@postgres:5432/vibeanywhere
POSTGRES_PASSWORD=yourpassword
```

## Switching Between Databases

### SQLite → PostgreSQL

1. Export your SQLite data (if needed):
   ```bash
   docker compose exec app npx tsx -e "/* export script */"
   ```

2. Update `.env`:
   ```bash
   DATABASE_URL=postgresql://vibeanywhere:password@postgres:5432/vibeanywhere
   POSTGRES_PASSWORD=password
   ```

3. Restart with PostgreSQL:
   ```bash
   docker compose down
   docker compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
   docker compose exec app npm run db:migrate
   ```

### PostgreSQL → SQLite

1. Export your PostgreSQL data (if needed)

2. Update `.env`:
   ```bash
   # DATABASE_URL=  # Empty or commented out
   ```

3. Restart with SQLite:
   ```bash
   docker compose down
   docker compose up -d
   docker compose exec app npm run db:migrate
   ```

## Database Operations

### Migrations

```bash
# Generate new migration (after schema changes)
npm run db:generate

# Apply migrations
docker compose exec app npm run db:migrate
```

### Drizzle Studio (Database UI)

```bash
# SQLite
DATABASE_URL="" npm run db:studio

# PostgreSQL
DATABASE_URL="postgresql://..." npm run db:studio
```

## Technical Details

### Schema Compatibility
Both databases use the same schema with automatic conversion:
- **UUIDs**: Generated in JavaScript with `crypto.randomUUID()`
- **Timestamps**: Stored as Unix milliseconds (integers)
- **JSON fields**: Stored as TEXT with automatic serialization

### SQLite Optimizations
- **Journal mode**: WAL (Write-Ahead Logging) for concurrent reads
- **Synchronous mode**: NORMAL for balanced performance/safety
- **Cache size**: 64MB
- **Memory-mapped I/O**: Enabled for faster reads
- **Foreign keys**: Enforced

### Migration Files
- **PostgreSQL**: `drizzle-postgres/` directory
- **SQLite**: `drizzle-sqlite/` directory

Both are included in the Docker image.

## FAQ

**Q: Which database should I use?**
A: Use SQLite (default) unless you need multi-server deployment.

**Q: Can I use an external PostgreSQL server?**
A: Yes! Just set `DATABASE_URL` to your external server and don't use `docker-compose.postgres.yml`.

**Q: How do I backup my data?**
A:
- **SQLite**: Copy `/data/app.db` file
- **PostgreSQL**: Use `pg_dump`

**Q: What's the performance difference?**
A: For single-server deployments with <1000 concurrent users, SQLite performs similarly to PostgreSQL and uses less resources.

**Q: Can I use SQLite in production?**
A: Yes! SQLite is production-ready and used by many large applications. With WAL mode enabled, it handles concurrent reads efficiently.
