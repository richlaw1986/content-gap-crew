"""Input validation against crew's inputSchema."""

from typing import Any

from app.models.sanity import Crew, InputField


class InputValidationError(Exception):
    """Raised when inputs don't match the crew's inputSchema."""
    
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(f"Input validation failed: {'; '.join(errors)}")


def validate_inputs(crew: Crew, inputs: dict[str, Any]) -> dict[str, Any]:
    """
    Validate inputs against crew's inputSchema.
    
    Returns validated/coerced inputs dict.
    Raises InputValidationError if validation fails.
    """
    errors: list[str] = []
    validated: dict[str, Any] = {}
    
    for field in crew.input_schema:
        value = inputs.get(field.name)
        
        # Check required fields
        if field.required:
            if value is None or value == "" or value == []:
                errors.append(f"Missing required field: {field.label}")
                continue
        
        # Skip optional fields that aren't provided
        if value is None:
            if field.default_value is not None:
                validated[field.name] = field.default_value
            continue
        
        # Type validation and coercion
        try:
            validated[field.name] = _coerce_value(field, value)
        except ValueError as e:
            errors.append(f"{field.label}: {e}")
    
    if errors:
        raise InputValidationError(errors)
    
    return validated


def _coerce_value(field: InputField, value: Any) -> Any:
    """Coerce value to the expected type."""
    
    if field.type == "string":
        if not isinstance(value, str):
            raise ValueError(f"Expected string, got {type(value).__name__}")
        return value
    
    elif field.type == "text":
        if not isinstance(value, str):
            raise ValueError(f"Expected string, got {type(value).__name__}")
        return value
    
    elif field.type == "number":
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            try:
                return float(value) if "." in value else int(value)
            except ValueError:
                raise ValueError(f"Cannot convert '{value}' to number")
        raise ValueError(f"Expected number, got {type(value).__name__}")
    
    elif field.type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value.lower() in ("true", "1", "yes"):
                return True
            if value.lower() in ("false", "0", "no"):
                return False
            raise ValueError(f"Cannot convert '{value}' to boolean")
        raise ValueError(f"Expected boolean, got {type(value).__name__}")
    
    elif field.type == "array":
        if isinstance(value, list):
            # Ensure all items are strings
            return [str(item) for item in value]
        if isinstance(value, str):
            # Allow comma-separated string
            return [item.strip() for item in value.split(",") if item.strip()]
        raise ValueError(f"Expected array, got {type(value).__name__}")
    
    elif field.type == "select":
        if not isinstance(value, str):
            raise ValueError(f"Expected string, got {type(value).__name__}")
        if field.options and value not in field.options:
            raise ValueError(f"Invalid option '{value}'. Must be one of: {', '.join(field.options)}")
        return value
    
    else:
        # Unknown type - pass through
        return value
