from datetime import datetime, timedelta
from typing import Optional
import aiomysql
import redis.asyncio as aioredis
import bcrypt

from shared.config import Config


def hash_url_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_url_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


async def create_url(
    db_pool: aiomysql.Pool,
    redis_client: aioredis.Redis,
    alias: str,
    long_url: str,
    is_custom: bool = False,
    password: Optional[str] = None,
    user_id: Optional[int] = None,
    expires_in_days: Optional[int] = None,
) -> dict:
    expires_at = None
    if expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

    password_hash = hash_url_password(password) if password else None

    async with db_pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO urls (alias, long_url, is_custom, password_hash, user_id, expires_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (alias, long_url, is_custom, password_hash, user_id, expires_at),
            )

    # Only cache non-password-protected URLs
    if not password_hash:
        cache_ttl = None
        if expires_at:
            cache_ttl = int((expires_at - datetime.utcnow()).total_seconds())
        if cache_ttl and cache_ttl > 0:
            await redis_client.setex(f"url:{alias}", cache_ttl, long_url)
        else:
            await redis_client.set(f"url:{alias}", long_url)

    return {
        "alias": alias,
        "long_url": long_url,
        "is_custom": is_custom,
        "expires_at": expires_at,
        "has_password": password_hash is not None,
    }


async def lookup_alias(db_pool: aiomysql.Pool, alias: str) -> Optional[dict]:
    """Look up alias metadata without revealing long_url. Returns None if not found/expired."""
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT alias, password_hash IS NOT NULL AS has_password, expires_at, long_url FROM urls WHERE alias = %s",
                (alias,),
            )
            row = await cur.fetchone()
            if row is None:
                return None

            if row["expires_at"] and row["expires_at"] < datetime.utcnow():
                await cur.execute("DELETE FROM urls WHERE alias = %s", (alias,))
                return None

            return {
                "alias": row["alias"],
                "has_password": bool(row["has_password"]),
                "long_url": row["long_url"],
            }


async def verify_and_get_url(
    db_pool: aiomysql.Pool,
    redis_client: aioredis.Redis,
    alias: str,
    password: str,
) -> Optional[str]:
    """Verify password and return long_url if correct."""
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT long_url, password_hash, expires_at FROM urls WHERE alias = %s",
                (alias,),
            )
            row = await cur.fetchone()
            if row is None:
                return None

            if row["expires_at"] and row["expires_at"] < datetime.utcnow():
                await cur.execute("DELETE FROM urls WHERE alias = %s", (alias,))
                return None

            if row["password_hash"] is None:
                return row["long_url"]

            if not verify_url_password(password, row["password_hash"]):
                return None  # Wrong password

            return row["long_url"]


async def get_url(db_pool: aiomysql.Pool, redis_client: aioredis.Redis, alias: str) -> Optional[str]:
    """Get URL only if not password-protected. Returns None if password-protected."""
    cached = await redis_client.get(f"url:{alias}")
    if cached:
        return cached

    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT long_url, password_hash, expires_at FROM urls WHERE alias = %s",
                (alias,),
            )
            row = await cur.fetchone()
            if row is None:
                return None

            if row["expires_at"] and row["expires_at"] < datetime.utcnow():
                await cur.execute("DELETE FROM urls WHERE alias = %s", (alias,))
                return None

            if row["password_hash"]:
                return None  # Password-protected, must use verify endpoint

            long_url = row["long_url"]
            if row["expires_at"]:
                ttl = int((row["expires_at"] - datetime.utcnow()).total_seconds())
                if ttl > 0:
                    await redis_client.setex(f"url:{alias}", ttl, long_url)
            else:
                await redis_client.set(f"url:{alias}", long_url)

            return long_url


async def alias_exists(db_pool: aiomysql.Pool, alias: str) -> bool:
    async with db_pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT 1 FROM urls WHERE alias = %s LIMIT 1", (alias,))
            return await cur.fetchone() is not None


async def get_user_urls(db_pool: aiomysql.Pool, user_id: int) -> list[dict]:
    async with db_pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT alias, long_url, is_custom, password_hash, expires_at, created_at "
                "FROM urls "
                "WHERE user_id = %s AND (expires_at IS NULL OR expires_at > %s) "
                "ORDER BY created_at DESC LIMIT 50",
                (user_id, datetime.utcnow()),
            )
            rows = await cur.fetchall()
            return [
                {
                    "alias": row["alias"],
                    "long_url": row["long_url"],
                    "is_custom": row["is_custom"],
                    "has_password": row["password_hash"] is not None,
                    "expires_at": row["expires_at"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]


async def delete_url(db_pool: aiomysql.Pool, redis_client: aioredis.Redis, alias: str, user_id: int) -> bool:
    async with db_pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM urls WHERE alias = %s AND user_id = %s",
                (alias, user_id),
            )
            deleted = cur.rowcount > 0

    if deleted:
        await redis_client.delete(f"url:{alias}")

    return deleted
