---
active: true
iteration: 1
max_iterations: 30
completion_promise: "COMPLETE"
started_at: "2026-01-10T17:02:14Z"
---

## Task: Add SQLite as Alternative Database Backend

Add SQLite as a production-ready file-based database option alongside PostgreSQL. Users can choose their preferred database backend at deployment time based on their needs (single-server simplicity vs. scalability).

### Git Workflow
- Commit after every iteration: `feat(db): [component] - [description]`
- Atomic commits for easy rollback

### Requirements

#### 1. Database Backend Selection
- Automatic detection based on DATABASE_URL:
  - Starts with `postgresql://` → PostgreSQL backend
  - Starts with `sqlite://` or `file:` or is a file path → SQLite backend
  - Fallback: SQLite at `./data/app.db` if DATABASE_URL is empty/undefined
- Both backends are production-ready, not dev-only

#### 2. SQLite Integration
- Install SQLite dependencies appropriate for the ORM in use
- Configure ORM/query builder for SQLite compatibility
- Handle SQLite-specific considerations:
  - No native ENUM support (use CHECK constraints or strings)
  - Different date/time handling
  - WAL mode for better concurrent read performance
  - Proper file permissions and path handling
- Ensure data directory is created automatically if needed

#### 3. Schema Compatibility
- All migrations must be database-agnostic or have variants
- Handle type differences (e.g., UUID, JSONB, arrays) gracefully
- Ensure indexes and constraints work on both backends

#### 4. Production Considerations for SQLite
- Configure WAL mode for better concurrency
- Proper connection pooling/handling for SQLite
- Backup considerations documented
- Performance notes for expected load

#### 5. README Documentation
Update README.md with:
- Database options section explaining both backends
- Quick start for SQLite (zero-config, just run)
- Quick start for PostgreSQL (connection string setup)
- Environment variables table including DATABASE_URL options
- Feature comparison table (any SQLite limitations vs PostgreSQL)
- Deployment recommendations (when to use which)
- Backup/restore instructions for SQLite deployments
- Migration commands for both backends

#### 6. Testing & Verification

**Test 1 - SQLite Deployment:**
- Configure DATABASE_URL for SQLite (or leave empty for default)
- Start the application
- Verify migrations complete successfully
- Generate/seed a test user
- Successfully authenticate with generated user

**Test 2 - PostgreSQL Deployment:**
- Configure DATABASE_URL with `postgresql://` connection
- Start the application
- Verify migrations complete successfully
- Generate/seed a test user
- Successfully authenticate with generated user

### Checklist
- [ ] DATABASE_URL parsing detects backend type correctly
- [ ] SQLite driver installed and configured
- [ ] ORM configuration supports both backends dynamically
- [ ] Migrations run successfully on fresh SQLite database
- [ ] Migrations run successfully on fresh PostgreSQL database
- [ ] User seeding/generation works on both backends
- [ ] Authentication works with SQLite backend
- [ ] Authentication works with PostgreSQL backend
- [ ] SQLite WAL mode enabled for production use
- [ ] README: database options overview
- [ ] README: SQLite quick start instructions
- [ ] README: PostgreSQL quick start instructions
- [ ] README: environment variables documented
- [ ] README: feature comparison table
- [ ] README: backup/restore for SQLite
- [ ] `.gitignore` updated to exclude SQLite database files
- [ ] `.env.example` updated with both database options

### Blocker Handling
If blocked after 20 iterations:
- Document what's blocking progress
- List attempted approaches  
- Suggest alternatives
Output <promise>BLOCKED</promise> with explanation.

### Deliverables
1. List of files created/modified
2. Summary of schema changes for SQLite compatibility
3. Any breaking changes or migration notes

Output <promise>COMPLETE</promise> when both deployment scenarios work (SQLite and PostgreSQL with successful user generation and authentication) and README is updated with complete database documentation.
