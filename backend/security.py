import hashlib
import hmac
from typing import Optional
from fastapi import Header, HTTPException, status
from db import db

def hash_api_key(api_key: str) -> str:
    """Computes SHA-256 hash of the API key for secure storage comparison."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()

def constant_time_compare(val_a: str, val_b: str) -> bool:
    """Prevents timing attacks via hmac.compare_digest."""
    return hmac.compare_digest(val_a.encode("utf-8"), val_b.encode("utf-8"))

async def verify_api_key(authorization: Optional[str] = Header(None)) -> str:
    """
    Middleware dependency to validate Bearer tokens in constant-time against registered project keys.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required (format: Bearer <API_KEY>)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <API_KEY>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    raw_api_key = parts[1].strip()
    key_hash = hash_api_key(raw_api_key)

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, api_key_hash FROM projects WHERE api_key_hash = $1",
            key_hash
        )
        if not row or not constant_time_compare(row["api_key_hash"], key_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or unrecognized API key.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return row["id"]
