"""FastAPI application for Content Gap Crew."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.logging_config import get_logger, setup_logging
from app.routers import agents, crews, health, runs
from app.services.sanity import get_sanity_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    settings = get_settings()
    
    # Initialize logging
    setup_logging(
        level="DEBUG" if settings.debug else "INFO",
        json_format=not settings.debug  # Human-readable in dev, JSON in prod
    )
    logger = get_logger(__name__)
    
    app.state.sanity = get_sanity_client()
    
    logger.info(
        f"Starting Content Gap Crew API",
        extra={"debug": settings.debug, "sanity_configured": app.state.sanity.configured}
    )
    
    yield
    
    logger.info("Shutting down Content Gap Crew API")
    await app.state.sanity.close()


app = FastAPI(
    title="Content Gap Crew API",
    description="API for running CrewAI content gap analysis crews",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(crews.router, prefix="/api/crews", tags=["crews"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
