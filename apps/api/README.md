# Content Gap Crew - API

FastAPI backend for the Content Gap Discovery Crew.

## Overview

This service provides:
- REST API for triggering crew runs
- SSE streaming for real-time progress updates
- Integration with Sanity for configuration
- CrewAI orchestration with dynamic crew assembly

## Reference

The original CrewAI script is preserved in `source-crewai-script.py` for reference.
This contains the 14 tools and 5 agents that need to be ported to this service.

## Setup

```bash
# From monorepo root
pnpm --filter api dev
```

## Architecture

See `/docs/architecture.md` in the monorepo root for full system design.
