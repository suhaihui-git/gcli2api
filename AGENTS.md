# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

gcli2api is a Python proxy server that converts GeminiCLI and Antigravity (Google experimental API) interfaces into OpenAI, Gemini Native, and Anthropic (Codex) API-compatible endpoints. Built with FastAPI and served via Hypercorn.

**Language**: Python 3.12+ (targets 3.13)
**License**: CNC-1.0 (non-commercial only)

## Commands

```bash
# Run the server
python web.py

# Install dependencies
pip install -e .            # production
pip install -e ".[dev]"     # with dev tools

# Formatting
black --line-length 100 .

# Type checking
mypy .

# Linting
flake8 .

# Tests (pytest configured in pyproject.toml)
pytest                      # run all tests
pytest test_foo.py          # run a single test file
pytest -k "test_name"       # run a specific test
```

No test files exist yet. Test paths configured as root directory (`.`), files matching `test_*.py`.

## Architecture

### Request Flow

```
Client Request → FastAPI Router → Converter → Google API Client → Response back to client
                 (format-specific)  (translates formats)  (src/api/)
```

### Two Parallel API Backends

The server supports two independent credential/API backends, each with its own set of routers:

1. **GeminiCLI** (`src/router/geminicli/`) - Standard Google Cloud Gemini API
2. **Antigravity** (`src/router/antigravity/`) - Google's experimental Antigravity API

Each backend exposes three format-compatible routers:
- `openai.py` → `/v1/chat/completions` (or `/antigravity/v1/...`)
- `gemini.py` → `/v1/models/{model}:generateContent` (or `/antigravity/v1/...`)
- `anthropic.py` → `/v1/messages` (or `/antigravity/v1/...`)

### Key Modules

- **`web.py`** — Entry point. Creates FastAPI app, mounts all routers, manages lifespan (init/shutdown).
- **`config.py`** — Centralized config with priority: Environment Variables > Database/Storage > Defaults. All config getters are async. Uses an in-memory cache initialized once at startup; call `reload_config()` after changes.
- **`log.py`** — Custom high-performance logging with background writer thread, lock-free deque queue, and batch file writes. Exports a global `log` singleton (`from log import log`).
- **`src/credential_manager.py`** — Singleton managing OAuth credentials: rotation, token refresh, auto-banning of failed credentials, random load balancing.
- **`src/storage_adapter.py`** — Protocol-based storage abstraction. Auto-selects SQLite (default) or MongoDB (when `MONGODB_URI` is set). All credential and config persistence goes through this.
- **`src/storage/sqlite_manager.py`** / **`mongodb_manager.py`** — Concrete storage backend implementations.
- **`src/converter/`** — Format translation layer:
  - `openai2gemini.py` — OpenAI messages → Gemini contents
  - `anthropic2gemini.py` — Anthropic messages → Gemini contents
  - `anti_truncation.py` — Detects truncated responses and auto-continues generation
  - `fake_stream.py` — Converts non-stream responses to SSE stream format
  - `gemini_fix.py` / `thoughtSignature_fix.py` — Response post-processing
- **`src/api/geminicli.py`** / **`antigravity.py`** — Low-level HTTP clients for calling the actual Google APIs.
- **`src/panel/`** — Web management console backend (auth, credential CRUD, config, logs, version).
- **`front/`** — Static frontend assets for the web management panel.

### Configuration Priority

Environment variables always win over database-stored config. The `ENV_MAPPINGS` dict in `config.py` maps env var names to config keys. Key env vars: `PORT`, `HOST`, `PASSWORD`, `API_PASSWORD`, `PANEL_PASSWORD`, `PROXY`, `MONGODB_URI`, `AUTO_BAN`, `LOG_LEVEL`.

### Coding Conventions

- **Black** formatting with 100-char line length
- Logging via `from log import log` then `log.info(...)`, `log.error(...)` etc. — do not use stdlib `logging`
- All storage operations go through `src/storage_adapter.py`, never access SQLite/MongoDB directly
- Config values fetched via async getters in `config.py` (e.g., `await get_server_port()`)
- Chinese comments and log messages are common throughout the codebase
- Bare `except:` clauses should use `except Exception:` instead
