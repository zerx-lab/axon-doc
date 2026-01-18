# AxonBase

AI-powered knowledge base system with hybrid search and RBAC permission management.

Built with Next.js 16 + React 19 + Supabase + pgvector.

## Features

- **Knowledge Base Management** - Create and organize knowledge bases with documents
- **Hybrid Search** - Vector similarity + BM25 keyword search with RRF fusion
- **Contextual Retrieval** - Anthropic-style contextual chunking for better retrieval
- **Reranking** - Support for Cohere, Jina, Voyage rerankers
- **RBAC** - Role-based access control with granular permissions
- **Background Tasks** - Real-time progress tracking for document processing
- **Multi-language** - Chinese and English interface

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Database | Supabase (PostgreSQL + pgvector) |
| Styling | Tailwind CSS v4 |
| AI SDK | Vercel AI SDK, Anthropic SDK, OpenAI SDK |
| Package Manager | Bun |

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Supabase

```bash
cd supabase-docker
docker compose up -d
```

### 3. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> Keys can be found in `supabase-docker/.env` after running `generate_keys.js`

### 4. Initialize Database

```bash
bun run db:push
```

This will apply migrations and seed data including:
- System roles (Super Administrator, Administrator, User Manager, Viewer)
- Default super admin account

**Default Credentials:**
- Username: `clown`
- Password: `012359clown`

> Change the default password in production!

### 5. Start Development Server

```bash
bun run dev
```

Visit http://localhost:3000

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |

### Database Commands

| Command | Description |
|---------|-------------|
| `bun run docker:up` | Start Supabase containers |
| `bun run docker:down` | Stop Supabase containers |
| `bun run docker:logs` | View container logs |
| `bun run db:push` | Apply migrations |
| `bun run db:reset` | Reset database and reapply migrations |
| `bun run db:seed` | Run seed data only |
| `bun run db:psql` | Open PostgreSQL shell |
| `bun run db:diff` | Generate migration diff |

## Project Structure

```
axon-base/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes
│   │   ├── auth/             # Authentication
│   │   ├── admin/            # Admin (users, roles)
│   │   ├── kb/               # Knowledge bases
│   │   ├── documents/        # Document management
│   │   ├── embeddings/       # Embedding operations
│   │   └── search/           # Hybrid search
│   ├── dashboard/            # Dashboard pages
│   └── login/                # Login page
├── components/               # React components
│   └── ui/                   # UI primitives
├── lib/                      # Utilities
│   ├── supabase/             # Supabase client & helpers
│   ├── chunking/             # Text chunking & context
│   ├── embeddings.ts         # Embedding generation
│   └── reranker.ts           # Reranking providers
├── supabase/                 # Database
│   ├── migrations/           # SQL migrations
│   └── seed.sql              # Seed data
└── supabase-docker/          # Docker setup
```

## Permissions

| Permission | Description |
|------------|-------------|
| `users:*` | User management (list, create, update, delete, toggle_active, reset_password) |
| `roles:*` | Role management (list, create, update, delete) |
| `kb:*` | Knowledge base operations |
| `docs:*` | Document operations |
| `embedding:*` | Embedding operations (view, manage, search) |
| `system:*` | System settings and logs |

## AI Configuration

Configure AI providers in Settings page:

- **Embedding Models**: OpenAI, Voyage, local compatible APIs
- **Chat Models**: Anthropic Claude, OpenAI GPT, compatible APIs
- **Rerankers**: Cohere, Jina, Voyage

## License

MIT
