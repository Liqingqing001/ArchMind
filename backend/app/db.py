import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def now():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./knowledge.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=10000")
Session = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with Session() as session:
        yield session
