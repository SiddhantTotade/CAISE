from celery import Celery

celery_app = Celery(
    "caise_worker",
    broker = "redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
    include=["app.workers.tasks"]
)

celery_app.conf.update(
    task_serializer = "json",
    accept_content = ["json"],
    result_serializer = "json",
    timezone = "UTC",
    enable_utc = True
)