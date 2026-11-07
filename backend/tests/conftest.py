import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.main import app


@pytest.fixture()
def db(tmp_path):
    url = os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
    engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def configure(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = sessionmaker(engine, expire_on_commit=False)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(db, monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("KNOWLEDGE_TOKEN", raising=False)
    def dependency():
        yield db
    app.dependency_overrides[get_db] = dependency
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
