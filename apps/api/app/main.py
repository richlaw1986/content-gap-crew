"""
Content Gap Crew - FastAPI Backend

Main application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import HealthResponse
from app.routers import chat, crews, runs
from app.services.sanity import close_sanity_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    settings = get_settings()
    print(f"Starting Content Gap Crew API ({settings.environment})")
    
    yield
    
    # Shutdown
    print("Shutting down...")
    await close_sanity_client()


app = FastAPI(
    title="Content Gap Crew API",
    description="API for managing and running CrewAI content gap analysis",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(crews.router)
app.include_router(runs.router)
app.include_router(chat.router)


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    
    Returns the API status, version, and environment.
    """
    return HealthResponse(
        status="ok",
        version="0.1.0",
        environment=settings.environment,
    )


@app.get("/", tags=["health"])
async def root():
    """Root endpoint - redirects to docs."""
    return {
        "message": "Content Gap Crew API",
        "docs": "/docs",
        "health": "/health",
    }
