"""Health check endpoints."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
async def health_check(request: Request) -> dict:
    """Basic health check endpoint."""
    sanity_client = request.app.state.sanity
    return {
        "status": "healthy",
        "sanity_configured": sanity_client.configured,
    }


@router.get("/")
async def root() -> dict:
    """Root endpoint with API info."""
    return {
        "name": "Content Gap Crew API",
        "version": "0.1.0",
        "docs": "/docs",
    }
