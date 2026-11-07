"""Run exactly one scheduler process alongside the API."""
import logging
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import select
from .db import Session, now
from .models import Source, Run
from .collector import collect

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def tick():
    with Session() as db:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        for run in db.scalars(select(Run).where(Run.status == "running", Run.started_at < cutoff)):
            run.status, run.message, run.finished_at = "failed", "任务中断或超时，已恢复，可重新巡检", now()
        db.commit()
        ids = list(db.scalars(select(Source.id).where(Source.enabled.is_(True), Source.is_demo.is_(False), Source.next_check_at <= now()).limit(20)))
        for id in ids:
            try:
                result = collect(db, id)
                log.info("source=%s status=%s", id, result.status)
            except Exception:
                db.rollback()
                log.exception("Collection skipped: %s", id)


if __name__ == "__main__":
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(tick, "interval", minutes=1, max_instances=1, coalesce=True)
    tick()
    scheduler.start()
