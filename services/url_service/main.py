from fastapi import FastAPI, HTTPException, status, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse
from contextlib import asynccontextmanager
import aiomysql
import redis.asyncio as aioredis

from shared.config import Config
from shared.models import ShortenRequest, ShortenResponse, PasswordVerifyRequest, UrlHistoryResponse
from shared.database import get_pool, init_db
from shared.cache import get_redis
from services.url_service.code_generator import generate_short_code, seed_counter_from_db
from services.url_service.url_repository import (
    create_url, get_url, alias_exists, lookup_alias, verify_and_get_url, get_user_urls, delete_url,
)
from services.url_service.password_page import password_page_html

RESERVED_ALIASES = {"health", "api", "auth", "shorten", "login", "register", "verify", "lookup", "favicon.ico", "robots.txt"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    pool = await get_pool()
    cache = await get_redis()
    await seed_counter_from_db(pool, cache)
    yield


app = FastAPI(title="URL Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_db():
    return await get_pool()


async def get_cache():
    return await get_redis()


async def get_optional_user(request: Request) -> dict | None:
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return {"id": int(user_id)}
    return None


@app.post("/api/shorten", response_model=ShortenResponse, status_code=status.HTTP_201_CREATED)
async def shorten_url(
    body: ShortenRequest,
    request: Request,
    db_pool: aiomysql.Pool = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_cache),
):
    if body.custom_alias:
        if body.custom_alias in RESERVED_ALIASES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This alias is reserved")
        if await alias_exists(db_pool, body.custom_alias):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Custom alias already taken")
        alias = body.custom_alias
        is_custom = True
    else:
        alias = await generate_short_code(redis_client, db_pool)
        is_custom = False

    user = await get_optional_user(request)
    user_id = user["id"] if user else None

    result = await create_url(
        db_pool=db_pool,
        redis_client=redis_client,
        alias=alias,
        long_url=str(body.long_url),
        is_custom=is_custom,
        password=body.password,
        user_id=user_id,
        expires_in_days=body.expires_in_days,
    )

    return ShortenResponse(
        short_url=f"{Config.BASE_URL}/{alias}",
        long_url=result["long_url"],
        alias=result["alias"],
        expires_at=result["expires_at"],
        is_custom=result["is_custom"],
        has_password=result["has_password"],
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/verify/{alias}")
async def verify_password(alias: str, body: PasswordVerifyRequest, db_pool: aiomysql.Pool = Depends(get_db), redis_client: aioredis.Redis = Depends(get_cache)):
    long_url = await verify_and_get_url(db_pool, redis_client, alias, body.password)
    if long_url is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    return {"long_url": long_url, "alias": alias}


@app.get("/api/lookup/{alias}")
async def lookup(alias: str, db_pool: aiomysql.Pool = Depends(get_db)):
    result = await lookup_alias(db_pool, alias)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")
    return result


@app.get("/api/urls", response_model=UrlHistoryResponse)
async def list_user_urls(
    request: Request,
    db_pool: aiomysql.Pool = Depends(get_db),
):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    rows = await get_user_urls(db_pool, user["id"])
    return UrlHistoryResponse(
        urls=[
            {
                "alias": r["alias"],
                "long_url": r["long_url"],
                "short_url": f"{Config.BASE_URL}/{r['alias']}",
                "is_custom": r["is_custom"],
                "has_password": r["has_password"],
                "expires_at": r["expires_at"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


@app.delete("/api/urls/{alias}")
async def delete_user_url(
    alias: str,
    request: Request,
    db_pool: aiomysql.Pool = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_cache),
):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    ok = await delete_url(db_pool, redis_client, alias, user["id"])
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or not owned by you")

    return {"detail": "deleted"}


@app.get("/{alias}")
async def redirect_or_password(alias: str, db_pool: aiomysql.Pool = Depends(get_db), redis_client: aioredis.Redis = Depends(get_cache)):
    if alias in RESERVED_ALIASES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")

    # First check if it's a password-protected URL
    meta = await lookup_alias(db_pool, alias)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")

    if meta["has_password"]:
        return HTMLResponse(content=password_page_html(alias), status_code=200)

    long_url = await get_url(db_pool, redis_client, alias)
    if long_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")
    return RedirectResponse(url=long_url, status_code=status.HTTP_301_MOVED_PERMANENTLY)
