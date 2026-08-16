# cold-outreach

Automated form filler for cold outreach campaigns.

## Quick Start

```bash
docker-compose up --build
```

## API

**Endpoint:** `POST /run`

```json
{
  "startUrl": "https://example.com/contact",
  "name": "John Doe",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "message": "Hello, I'd like to connect!",
  "company": "Acme Inc",
  "phone": "1234567890",
  "subject": "Hello",
  "unknown": "Unknown",
  "location": "US"
}
```

**Response:**

```json
{
  "success": true,
  "status": "success",
  "url": "https://example.com/contact",
  "submitted": true
}
```

## Docker

### Using n8n

The container connects to the external `n8n` network. From n8n, call:

```
http://cold-outreach:3000/run
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_URL` | OpenAI API URL (e.g., Ollama) |
| `OPENAI_MODEL` | Model name |
| `TWOCAPTCHA_TOKEN` | 2Captcha token for solving captchas |
| `PROXY_URL` | Proxy URL |
| `PROXY_USERNAME` | Proxy username |
| `PROXY_PASSWORD` | Proxy password |
| `HEADLESS` | Run browser in headless mode (default: true) |
| `SUPABASE_URL` | Supabase project URL (uploads success screenshots) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
