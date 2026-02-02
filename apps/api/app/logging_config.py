"""Structured logging configuration for the Content Gap Crew API."""

import json
import logging
import sys
import time
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add extra fields if present
        if hasattr(record, "tool_name"):
            log_data["tool_name"] = record.tool_name
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "credential_types"):
            log_data["credential_types"] = record.credential_types
        if hasattr(record, "storage_method"):
            log_data["storage_method"] = record.storage_method
        if hasattr(record, "groq_query"):
            log_data["groq_query"] = record.groq_query
        if hasattr(record, "error_type"):
            log_data["error_type"] = record.error_type
        if hasattr(record, "args_summary"):
            log_data["args_summary"] = record.args_summary

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logging(level: str = "INFO", json_format: bool = True) -> None:
    """Configure logging for the application.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        json_format: Use JSON formatting (True for production, False for dev)
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, level.upper()))

    if json_format:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
        ))

    root_logger.addHandler(handler)

    # Set specific logger levels
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)


# Tool logging utilities

def mask_sensitive(value: str, visible_chars: int = 4) -> str:
    """Mask sensitive values, showing only first few characters."""
    if not value or len(value) <= visible_chars:
        return "***"
    return value[:visible_chars] + "***"


@contextmanager
def log_tool_execution(logger: logging.Logger, tool_name: str, args_summary: dict[str, Any] | None = None):
    """Context manager for logging tool execution with timing.
    
    Usage:
        with log_tool_execution(logger, "fetch_webpage", {"url": url}):
            # tool code here
    """
    start_time = time.perf_counter()
    
    # Sanitize args for logging (mask potential secrets)
    safe_args = {}
    if args_summary:
        for key, value in args_summary.items():
            if any(secret in key.lower() for secret in ["key", "token", "secret", "password", "credential"]):
                safe_args[key] = mask_sensitive(str(value)) if value else None
            elif isinstance(value, str) and len(value) > 200:
                safe_args[key] = value[:200] + "..."
            else:
                safe_args[key] = value
    
    logger.info(
        f"Tool started: {tool_name}",
        extra={"tool_name": tool_name, "args_summary": safe_args}
    )
    
    try:
        yield
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            f"Tool completed: {tool_name}",
            extra={"tool_name": tool_name, "duration_ms": round(duration_ms, 2)}
        )
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            f"Tool failed: {tool_name} - {type(e).__name__}: {e}",
            extra={
                "tool_name": tool_name,
                "duration_ms": round(duration_ms, 2),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        raise


def log_credential_resolution(
    logger: logging.Logger,
    credential_type: str,
    storage_method: str,
    resolved: bool,
    env_var: str | None = None
) -> None:
    """Log credential resolution attempts."""
    if resolved:
        logger.debug(
            f"Credential resolved: {credential_type} via {storage_method}",
            extra={
                "credential_types": [credential_type],
                "storage_method": storage_method
            }
        )
    else:
        logger.warning(
            f"Credential missing: {credential_type} (expected via {storage_method})",
            extra={
                "credential_types": [credential_type],
                "storage_method": storage_method
            }
        )


def log_groq_query(logger: logging.Logger, query: str, params: dict[str, Any] | None = None) -> None:
    """Log GROQ queries at DEBUG level."""
    # Truncate very long queries
    display_query = query if len(query) <= 500 else query[:500] + "..."
    logger.debug(
        f"GROQ query: {display_query}",
        extra={"groq_query": display_query}
    )
