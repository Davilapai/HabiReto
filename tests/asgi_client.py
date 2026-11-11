"""Harness de pruebas ASGI en memoria sin dependencias externas.

Permite invocar aplicaciones FastAPI directamente en el ciclo de eventos asíncrono
ejecutando todo el pipeline de Starlette (middlewares, dependencias, serializadores,
manejadores de excepción) a máxima velocidad y sin requerir httpx ni acceso a red.
"""

import json
import urllib.parse
from typing import Any, MutableMapping
from fastapi import FastAPI


class ASGIResponse:
    """Representa la respuesta HTTP recibida desde la aplicación ASGI."""

    def __init__(self, status_code: int, headers: list[tuple[bytes, bytes]], body: bytes) -> None:
        self.status_code = status_code
        self.headers: dict[str, str] = {
            k.decode("latin-1").lower(): v.decode("latin-1") for k, v in headers
        }
        self.content = body
        self.text = body.decode("utf-8")

    def json(self) -> Any:
        """Parsea el cuerpo de la respuesta como JSON."""
        return json.loads(self.text)


class ASGIClient:
    """Cliente HTTP asíncrono en memoria para pruebas de integración con FastAPI."""

    def __init__(self, app: FastAPI) -> None:
        self.app = app

    async def request(
        self,
        method: str,
        path: str,
        headers: dict[str, str] | None = None,
        json_data: Any = None,
        params: dict[str, Any] | None = None,
    ) -> ASGIResponse:
        """Ejecuta una petición HTTP en memoria contra la aplicación ASGI."""
        url_parts = urllib.parse.urlparse(path)
        raw_path = url_parts.path.encode("ascii")

        query_params = dict(urllib.parse.parse_qsl(url_parts.query))
        if params:
            query_params.update(params)
        query_string = urllib.parse.urlencode(query_params).encode("ascii")

        body_bytes = b""
        request_headers: list[tuple[bytes, bytes]] = []

        if headers:
            for k, v in headers.items():
                request_headers.append((k.lower().encode("latin-1"), str(v).encode("latin-1")))

        if json_data is not None:
            body_bytes = json.dumps(json_data).encode("utf-8")
            if not any(k.lower() == b"content-type" for k, _ in request_headers):
                request_headers.append((b"content-type", b"application/json"))

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method.upper(),
            "path": url_parts.path,
            "raw_path": raw_path,
            "query_string": query_string,
            "headers": request_headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }

        response_status = 500
        response_headers: list[tuple[bytes, bytes]] = []
        response_body: list[bytes] = []

        async def receive() -> dict[str, Any]:
            return {
                "type": "http.request",
                "body": body_bytes,
                "more_body": False,
            }

        async def send(message: MutableMapping[str, Any]) -> None:
            nonlocal response_status, response_headers, response_body
            if message["type"] == "http.response.start":
                response_status = message["status"]
                response_headers = message.get("headers", [])
            elif message["type"] == "http.response.body":
                response_body.append(message.get("body", b""))

        await self.app(scope, receive, send)

        return ASGIResponse(
            status_code=response_status,
            headers=response_headers,
            body=b"".join(response_body),
        )

    async def get(
        self,
        path: str,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ASGIResponse:
        return await self.request("GET", path, headers=headers, params=params)

    async def post(
        self,
        path: str,
        headers: dict[str, str] | None = None,
        json: Any = None,
    ) -> ASGIResponse:
        return await self.request("POST", path, headers=headers, json_data=json)
