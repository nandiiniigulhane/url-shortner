from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, HTMLResponse
import httpx

from shared.config import Config
from shared.cache import get_redis
from services.auth_service.jwt_handler import decode_access_token
from services.api_gateway.rate_limiter import check_rate_limit

app = FastAPI(title="API Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HTTPX_TIMEOUT = httpx.Timeout(30.0)

URL_SERVICE = f"http://{Config.URL_SERVICE_HOST}:{Config.URL_SERVICE_PORT}"
AUTH_SERVICE = f"http://{Config.AUTH_SERVICE_HOST}:{Config.AUTH_SERVICE_PORT}"


def extract_user_context(request: Request) -> dict | None:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    try:
        payload = decode_access_token(auth[7:])
        return {"id": payload["sub"], "email": payload["email"]}
    except Exception:
        return None


@app.api_route("/api/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_auth(path: str, request: Request):
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        body = await request.body()
        headers = dict(request.headers)
        headers.pop("host", None)

        resp = await client.request(
            method=request.method,
            url=f"{AUTH_SERVICE}/api/auth/{path}",
            headers=headers,
            content=body,
        )
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.api_route("/api/shorten", methods=["POST"])
async def proxy_shorten(request: Request):
    redis_client = await get_redis()
    if not await check_rate_limit(request, redis_client):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    user = extract_user_context(request)

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        body = await request.body()
        headers = {
            "Content-Type": request.headers.get("Content-Type", "application/json"),
        }
        if user:
            headers["X-User-Id"] = str(user["id"])

        resp = await client.post(f"{URL_SERVICE}/api/shorten", headers=headers, content=body)
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.api_route("/api/verify/{alias}", methods=["POST"])
async def proxy_verify(alias: str, request: Request):
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        body = await request.body()
        resp = await client.post(
            f"{URL_SERVICE}/api/verify/{alias}",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.api_route("/api/lookup/{alias}", methods=["GET"])
async def proxy_lookup(alias: str):
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        resp = await client.get(f"{URL_SERVICE}/api/lookup/{alias}")
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.api_route("/api/urls", methods=["GET"])
async def proxy_list_urls(request: Request):
    user = extract_user_context(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        headers = {
            "Content-Type": "application/json",
            "X-User-Id": str(user["id"]),
        }
        resp = await client.get(f"{URL_SERVICE}/api/urls", headers=headers)
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.api_route("/api/urls/{alias}", methods=["DELETE"])
async def proxy_delete_url(alias: str, request: Request):
    user = extract_user_context(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        headers = {"X-User-Id": str(user["id"])}
        resp = await client.delete(f"{URL_SERVICE}/api/urls/{alias}", headers=headers)
        return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


@app.get("/health")
async def health():
    return {"status": "ok"}


RESERVED_ALIASES = {"health", "api", "auth", "shorten", "login", "register", "verify", "lookup", "favicon.ico", "robots.txt"}


@app.get("/{alias}")
async def proxy_redirect(alias: str):
    if alias in RESERVED_ALIASES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")

    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT, follow_redirects=False) as client:
        resp = await client.get(f"{URL_SERVICE}/{alias}")

        if resp.status_code == 404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")

        # Password-protected URLs return an HTML page
        content_type = resp.headers.get("content-type", "")
        if "text/html" in content_type:
            return HTMLResponse(content=resp.content, status_code=200)

        location = resp.headers.get("location")
        if location:
            return RedirectResponse(url=location, status_code=status.HTTP_301_MOVED_PERMANENTLY)

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="URL not found or expired")
