"""Public Almosafer HTTP transport. IPC only; never prints credentials or bodies to logs."""
import asyncio
import json
import sys
import time
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

from curl_cffi.requests import AsyncSession

ORIGINS = {"https://www.almosafer.com", "https://global.almosafer.com"}
MAX_BODY = 8 * 1024 * 1024


def validate_url(url):
    parsed = urlsplit(url)
    if (f"{parsed.scheme}://{parsed.netloc}" not in ORIGINS
            or parsed.username or parsed.password):
        raise ValueError("unsupported origin")


async def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    sessions = {}
    tasks = {}
    slots = asyncio.Semaphore(8)

    def emit(value):
        print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)

    async def request(item):
        request_id = item["id"]
        try:
            validate_url(item["url"])
            async with slots:
                remaining = (item["deadline"] - time.time() * 1000) / 1000
                if remaining <= 0:
                    raise TimeoutError()
                origin = "https://" + urlsplit(item["url"]).netloc
                headers = item.get("headers", {})
                supplied_cookies = headers.pop("cookie", headers.pop("Cookie", None))
                if origin not in sessions:
                    sessions[origin] = AsyncSession(
                        impersonate="chrome124", trust_env=False, verify=True,
                        max_clients=8, allow_redirects=False,
                    )
                    if supplied_cookies:
                        cookies = SimpleCookie()
                        cookies.load(supplied_cookies)
                        sessions[origin].cookies.update({key: value.value for key, value in cookies.items()})
                chunks = []
                size = 0

                def receive(chunk):
                    nonlocal size
                    size += len(chunk)
                    if size > MAX_BODY:
                        raise ValueError("response too large")
                    chunks.append(chunk)

                response = await sessions[origin].request(
                    item.get("method", "GET"), item["url"],
                    headers=headers,
                    data=item.get("body"), timeout=min(20, remaining),
                    content_callback=receive,
                )
                emit({"id": request_id, "status": response.status_code,
                      "headers": list(response.headers.multi_items()),
                      "body": b"".join(chunks).decode("utf-8", errors="replace")})
        except asyncio.CancelledError:
            pass
        except Exception as error:
            # Exceptions can contain signed URLs, tokens and proxy credentials.
            emit({"id": request_id, "error": "HTTP_TRANSPORT_FAILED", "errorType": type(error).__name__})
        finally:
            tasks.pop(request_id, None)

    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            item = json.loads(line)
            if item.get("cancel"):
                task = tasks.get(item["id"])
                if task:
                    task.cancel()
            else:
                tasks[item["id"]] = asyncio.create_task(request(item))
    finally:
        for task in list(tasks.values()):
            task.cancel()
        await asyncio.gather(*list(tasks.values()), return_exceptions=True)
        for session in sessions.values():
            await session.close()


if __name__ == "__main__":
    # curl_cffi requires the selector loop for sockets on Windows.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
