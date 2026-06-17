from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.quotes import router as quotes_router

app = FastAPI(title="Vendra Quote API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quotes_router)
