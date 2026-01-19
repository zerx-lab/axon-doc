"""Job manager for tracking and controlling crawl job states."""

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)


class JobState(str, Enum):
    """Internal job state for control signals."""

    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


@dataclass
class JobControl:
    """Control structure for a running job."""

    job_id: str
    state: JobState = JobState.RUNNING
    pause_event: asyncio.Event = field(default_factory=asyncio.Event)

    def __post_init__(self) -> None:
        self.pause_event.set()


class JobManager:
    """
    Singleton manager for tracking and controlling crawl jobs.

    Provides thread-safe operations for:
    - Registering new jobs
    - Checking if a job should stop (cancelled)
    - Pausing and resuming jobs
    - Cleaning up completed jobs
    """

    _instance: "JobManager | None" = None
    _lock = Lock()

    def __new__(cls) -> "JobManager":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._jobs: dict[str, JobControl] = {}
        self._jobs_lock = Lock()
        self._initialized = True
        logger.info("JobManager initialized")

    def register_job(self, job_id: str) -> None:
        """Register a new job for tracking."""
        with self._jobs_lock:
            if job_id in self._jobs:
                logger.warning(f"Job {job_id} already registered, resetting state")
            self._jobs[job_id] = JobControl(job_id=job_id)
            logger.info(f"Job {job_id} registered")

    def unregister_job(self, job_id: str) -> None:
        """Remove a job from tracking."""
        with self._jobs_lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                logger.info(f"Job {job_id} unregistered")

    def is_job_cancelled(self, job_id: str) -> bool:
        """Check if a job has been cancelled."""
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                return True
            return job.state == JobState.CANCELLED

    def is_job_paused(self, job_id: str) -> bool:
        """Check if a job is paused."""
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            return job.state == JobState.PAUSED

    def should_stop(self, job_id: str) -> bool:
        """
        Check if a job should stop processing.
        Returns True if cancelled or not registered.
        """
        return self.is_job_cancelled(job_id)

    def cancel_job(self, job_id: str) -> bool:
        """
        Mark a job as cancelled.
        Returns True if job was found and cancelled, False otherwise.
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                logger.warning(f"Cannot cancel job {job_id}: not found")
                return False

            if job.state in (JobState.CANCELLED, JobState.COMPLETED):
                logger.warning(f"Job {job_id} already in terminal state: {job.state}")
                return False

            job.state = JobState.CANCELLED
            job.pause_event.set()
            logger.info(f"Job {job_id} cancelled")
            return True

    def pause_job(self, job_id: str) -> bool:
        """
        Pause a running job.
        Returns True if job was found and paused, False otherwise.
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                logger.warning(f"Cannot pause job {job_id}: not found")
                return False

            if job.state != JobState.RUNNING:
                logger.warning(f"Cannot pause job {job_id}: state is {job.state}")
                return False

            job.state = JobState.PAUSED
            job.pause_event.clear()
            logger.info(f"Job {job_id} paused")
            return True

    def resume_job(self, job_id: str) -> bool:
        """
        Resume a paused job.
        Returns True if job was found and resumed, False otherwise.
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                logger.warning(f"Cannot resume job {job_id}: not found")
                return False

            if job.state != JobState.PAUSED:
                logger.warning(f"Cannot resume job {job_id}: state is {job.state}")
                return False

            job.state = JobState.RUNNING
            job.pause_event.set()
            logger.info(f"Job {job_id} resumed")
            return True

    def mark_completed(self, job_id: str) -> None:
        """Mark a job as completed."""
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.state = JobState.COMPLETED
                logger.info(f"Job {job_id} marked as completed")

    def get_job_state(self, job_id: str) -> JobState | None:
        """Get the current state of a job."""
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            return job.state if job else None

    async def wait_if_paused(self, job_id: str, timeout: float = 1.0) -> bool:
        """
        Wait if job is paused. Returns False if cancelled, True otherwise.

        This should be called periodically in the crawl loop.
        Uses timeout to allow periodic cancellation checks.
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.state == JobState.CANCELLED:
                return False
            pause_event = job.pause_event

        while True:
            try:
                await asyncio.wait_for(
                    asyncio.shield(self._wait_for_event(pause_event)), timeout=timeout
                )
                break
            except asyncio.TimeoutError:
                with self._jobs_lock:
                    job = self._jobs.get(job_id)
                    if job is None or job.state == JobState.CANCELLED:
                        return False
                    if job.state != JobState.PAUSED:
                        break
                continue

        return True

    @staticmethod
    async def _wait_for_event(event: asyncio.Event) -> None:
        """Helper to wait for an event."""
        await event.wait()

    def get_active_jobs(self) -> list[str]:
        """Get list of active (running or paused) job IDs."""
        with self._jobs_lock:
            return [
                job_id
                for job_id, job in self._jobs.items()
                if job.state in (JobState.RUNNING, JobState.PAUSED)
            ]

    def get_job_info(self, job_id: str) -> dict[str, Any] | None:
        """Get information about a job."""
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return {
                "job_id": job.job_id,
                "state": job.state.value,
                "is_paused": job.state == JobState.PAUSED,
            }


_job_manager: JobManager | None = None


def get_job_manager() -> JobManager:
    """Get the global JobManager instance."""
    global _job_manager
    if _job_manager is None:
        _job_manager = JobManager()
    return _job_manager
