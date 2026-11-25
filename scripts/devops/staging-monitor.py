#!/usr/bin/env python3
"""Poll the FBE staging probe and persist transitions before making deliveries."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timezone
from time import time
from uuid import uuid4


RETRY_DELAYS = (300, 900, 3600)


def save_state(path, state):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(json.dumps(state).encode())
            handle.flush()
            os.fsync(handle.fileno())
            os.replace(temporary, path)
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            temporary.unlink(missing_ok=True)


def record_probe(state, healthy, probe):
    if healthy:
        state["failures"] = 0
    else:
        state["failures"] = min(2, state["failures"] + 1)

    status = "recovered" if healthy and state["incident"] else None
    if state["failures"] == 2 and not state["incident"]:
        status = "failed"
    if status:
        state["incident"] = status == "failed"
        state["outbox"].append({
            "id": str(uuid4()),
            "probe": probe,
            "status": status,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "delivery": "pending",
        })


def run(state_path, transport, probe, probe_args, reconcile):
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state["probe"] != probe:
            raise ValueError("State is already assigned to another probe")
    else:
        state = {"probe": probe, "failures": 0, "incident": False, "outbox": []}

    if reconcile:
        identifier, outcome = reconcile
        outbox = state["outbox"]
        if not outbox or outbox[0]["id"] != identifier or outbox[0]["delivery"] != "sending":
            raise ValueError("Only the in-flight notification can be reconciled")
        if outcome == "delivered":
            outbox.pop(0)
        else:
            outbox[0]["delivery"] = "pending"
        save_state(state_path, state)
        return 0

    try:
        command = ["bash", str(Path(__file__).with_name("staging-status.sh")), probe, *probe_args]
        result = subprocess.run(command, capture_output=True, timeout=25, check=False)
        if result.returncode not in (0, 1):
            raise ValueError("Probe configuration or execution failed")
        healthy = result.returncode == 0
    except subprocess.TimeoutExpired:
        healthy = False

    record_probe(state, healthy, probe)
    save_state(state_path, state)
    if not state["outbox"]:
        print("fbe_monitor=healthy" if healthy else "fbe_monitor=probe_failed", flush=True)
        return 0

    notice = state["outbox"][0]
    now = int(time())
    if notice["delivery"] not in ("pending", "sending"):
        raise ValueError("Unknown notification delivery state")
    if notice["delivery"] == "sending" and "next_attempt_at" not in notice:
        # Older releases required reconciliation. Wait once before resuming them.
        notice["attempts"] = max(1, notice.get("attempts", 0))
        notice["next_attempt_at"] = now + RETRY_DELAYS[0]
        save_state(state_path, state)
    attempts = notice.get("attempts", 0)
    next_attempt = notice.get("next_attempt_at", 0)
    if type(attempts) is not int or attempts < 0 or type(next_attempt) is not int or next_attempt < 0:
        raise ValueError("Invalid notification retry state")
    if now < next_attempt:
        print(f"fbe_notice=waiting id={notice['id']} next_attempt_at={next_attempt}", flush=True)
        return 1

    notice["delivery"] = "sending"
    notice["attempts"] = attempts + 1
    notice["next_attempt_at"] = now + RETRY_DELAYS[min(attempts, len(RETRY_DELAYS) - 1)]
    # Persist before invoking the transport so a crash cannot cause an immediate retry.
    save_state(state_path, state)
    try:
        result = subprocess.run([transport], input=json.dumps(notice), text=True,
                                capture_output=True, timeout=40, check=False)
        delivery = result.returncode
    except OSError:
        delivery = 75  # The transport did not start.
    except subprocess.TimeoutExpired:
        delivery = 76  # It may already have submitted the message.
    if delivery == 0:
        state["outbox"].pop(0)
        save_state(state_path, state)
        print(f"fbe_notice=accepted id={notice['id']} transition={notice['status']}", flush=True)
        return 0
    if delivery == 75:
        notice["delivery"] = "pending"
        save_state(state_path, state)
    # Ambiguous delivery retries the same ID; a lost acceptance can produce a duplicate.
    print(f"fbe_notice=retry id={notice['id']} next_attempt_at={notice['next_attempt_at']}", flush=True)
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--transport", required=True)
    parser.add_argument("--reconcile", nargs=2, metavar=("ID", "OUTCOME"))
    parser.add_argument("probe", choices=["public", "host"])
    parser.add_argument("probe_args", nargs="*")
    args = parser.parse_args()
    if (len(args.probe_args) != (0 if args.probe == "public" else 4)
            or not Path(args.transport).is_absolute()
            or not args.state.is_absolute()
            or args.reconcile and args.reconcile[1] not in ("delivered", "rejected")):
        parser.error("Invalid probe, reconciliation or path configuration")
    os.umask(0o077)
    try:
        with args.state.with_suffix(".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return run(args.state, args.transport, args.probe, args.probe_args, args.reconcile)
    except (OSError, ValueError, TypeError, KeyError):
        print("fbe_monitor=state_or_configuration_error", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

