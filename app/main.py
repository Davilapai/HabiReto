from fastapi import FastAPI

app = FastAPI(
    title="HabiCapital Transfer Core API",
    version="0.1.0",
)


@app.get("/healthcheck")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
