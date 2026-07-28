# Maya AI Concierge — Architecture

```mermaid
graph TB
    subgraph Channels
        WEB[Web Chat]
        META[Meta Messenger]
        IG[Instagram]
    end

    subgraph API
        CHAT[/api/chat]
        META_W[/api/webhook/meta]
        BOOK[/api/bookings]
        STRIPE_W[/api/stripe/webhook]
        LS_W[/api/lemonsqueezy/webhook]
        DASH[/api/dashboard/*]
    end

    subgraph Engine
        MAESTRO[lib/maestro.js]
        TOOLS[lib/tools.js]
        AI[AI Provider]
    end

    subgraph Storage
        SUPABASE[Supabase]
        REDIS[Upstash Redis]
        MEM[In-Memory Fallback]
    end

    subgraph Integrations
        CAL[Google Calendar]
        TWILIO[Twilio SMS]
        EMAIL[Resend]
        JOBBER[Jobber CRM]
        GBP[Google Business Profile]
    end

    subgraph Payments
        LS[LemonSqueezy]
        STRIPE[Stripe]
    end

    WEB --> CHAT
    META --> META_W
    IG --> META_W
    CHAT --> MAESTRO
    META_W --> MAESTRO
    MAESTRO --> TOOLS
    MAESTRO --> AI
    TOOLS --> BOOK
    BOOK --> SUPABASE
    TOOLS --> CAL
    STRIPE_W --> STRIPE
    STRIPE_W --> SUPABASE
    LS_W --> LS
    LS_W --> SUPABASE
    DASH --> SUPABASE
    MAESTRO --> REDIS
    BOOK --> REDIS

    style AI fill:#f9a,stroke:#333
    style MAESTRO fill:#69f,stroke:#333
    style SUPABASE fill:#3a3,stroke:#333
    style REDIS fill:#f63,stroke:#333
```

## Data Flow

1. **User message** arrives via Web Chat, Messenger, or Instagram
2. **API route** validates, rate-limits, resolves business_id
3. **orchestrateMaya()** builds system prompt, prunes history, calls AI
4. **AI returns** tool calls or final response
5. **Tool execution** writes to Supabase, Google Calendar, Twilio, etc.
6. **Response** returned to user via the original channel

## Key Design Decisions

- **Single orchestration engine** (`lib/maestro.js`) shared by all channels
- **Model failover**: Gemini → DeepSeek → OpenAI (configured via env vars)
- **Dual payment provider**: LemonSqueezy primary (Pakistan-compatible), Stripe fallback
- **PII encryption**: AES-256-GCM via `ENCRYPTION_KEY` env var
- **Rate limiting**: Redis-only (Upstash); in-memory fallback intentionally omitted for security
- **Idempotency**: DB unique constraints (`stripe_session_id`, `idx_unique_slot`) + Redis dedup
- **Multi-tenant**: Every query scoped by `business_id`
