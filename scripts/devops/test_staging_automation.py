import importlib.util
import io
import json
import os
from pathlib import Path
from shutil import copy2, which
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


SCRIPTS = Path(__file__).resolve().parent


class StagingAutomationTests(unittest.TestCase):
    def setUp(self):
        scratch = TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.env = {**os.environ, "PATH": str(self.root) + ":" + os.environ["PATH"],
                    "FIXTURE_DIR": str(self.root), "TMPDIR": str(self.root)}

    def script(self, name, content):
        path = self.root / name
        path.write_text(content)
        path.chmod(0o700)
        return path

    def execute(self, *command, **env):
        return subprocess.run(command, env={**self.env, **env}, capture_output=True,
                              text=True, check=False, timeout=20)

    def test_new_sessions_and_unavailable_issuer_block_upload(self):
        state = self.root / "state"
        bin_dir = state / "bin"
        bin_dir.mkdir(parents=True)
        runtime = self.root / "runtime"
        runtime.mkdir()
        self.script("issuer-header", "Authorization: Bearer fixture\n")
        for name in ("staging-backup-service.sh", "staging-r2-credentials.sh", "staging-backup-job.sh"):
            copy2(SCRIPTS / name, self.root)
        self.script("staging-backup.sh", "printf 'ciphertext' > \"$4\"\n")
        self.script("staging-backup-cycle.sh", """set -eu
root=$(dirname "$0")
printf '%s\\n' captured >>"$root/captures"
bash "$root/staging-backup-job.sh" "$1" fixture fixture "$7"
""")
        self.script("stat", "#!/usr/bin/env bash\nprintf '%s\\n' tmpfs\n")
        if not which("flock"):
            self.script("flock", '#!/usr/bin/env bash\n[[ "$*" == "--nonblock 9" ]]\n')
        (bin_dir / "jq").symlink_to(which("jq"))
        (bin_dir / "python3").symlink_to(sys.executable)
        self.script("state/bin/curl", """#!/usr/bin/env python3
import datetime, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
counter = root / "counter"
serial = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(serial))
mode = (root / "issuer-mode").read_text()
expiry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
    minutes=5 if mode == "short" else 30)
print(json.dumps({"Version": 1, "AccessKeyId": "fixture", "SecretAccessKey": "fixture",
    "SessionToken": "fixture-" + str(serial), "Expiration": expiry.strftime("%Y-%m-%dT%H:%M:%SZ")}))
if mode == "unavailable":
    print("simulated confidential provider detail", file=sys.stderr)
    sys.exit(1)
""")
        self.script("state/bin/aws", """#!/usr/bin/env bash
set -eu
[[ -z "${AWS_ACCESS_KEY_ID:-}" && "$AWS_SHARED_CREDENTIALS_FILE" == /dev/null ]]
root=$(cd -- "$(dirname "$0")/../.." && pwd)
read -r -a credential_process <<<"$(sed -n 's/^credential_process = //p' "$AWS_CONFIG_FILE")"
session=$("${credential_process[@]}")
jq -r '.SessionToken' <<<"$session" >>"$root/sessions"
if [[ "$5" == s3://* ]]; then
  cp "$root/object" "$6"
else
  cp "$5" "$root/object"
fi
""")
        status = state / "status.json"
        command = ("bash", str(self.root / "staging-backup-service.sh"))
        env = dict(STATE_DIRECTORY=str(state), RUNTIME_DIRECTORY=str(runtime), CREDENTIALS_DIRECTORY=str(self.root),
                   FBE_R2_ISSUER_URL="https://issuer.example.test/session", AWS_ACCESS_KEY_ID="operator-fixture",
                   FBE_BACKUP_S3_ENDPOINT="https://r2.example.test",
                   FBE_BACKUP_S3_PREFIX="s3://fixture-bucket/fbe/staging/", FBE_PG_CONTAINER="db",
                   FBE_API_CONTAINER="api", FBE_MIGRATE_CONTAINER="migrate", FBE_WEB_CONTAINER="web",
                   FBE_RELEASE_MANIFEST="fixture", FBE_GPG_FINGERPRINT="fixture")
        for _ in range(2):
            (self.root / "issuer-mode").write_text("valid")
            good = self.execute(*command, **env)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(json.loads(status.read_text())["status"], "verified")
        sessions = ["fixture-1", "fixture-1", "fixture-2", "fixture-2"]
        self.assertEqual((self.root / "sessions").read_text().splitlines(), sessions)
        for mode in ("short", "unavailable"):
            (self.root / "issuer-mode").write_text(mode)
            failure = self.execute(*command, **env)
            self.assertNotEqual(failure.returncode, 0)
            self.assertEqual(failure.stdout, "")
            self.assertIn("could not be renewed", failure.stderr)
            self.assertNotIn("confidential", failure.stderr)
            self.assertEqual(json.loads(status.read_text())["status"], "failed")
            self.assertEqual((self.root / "sessions").read_text().splitlines(), sessions)
            self.assertEqual((self.root / "captures").read_text().splitlines(), ["captured", "captured"])
            self.assertEqual((self.root / "object").read_text(), "ciphertext")
            self.assertEqual(list(runtime.iterdir()), [])

    def monitor_fixture(self):
        copy2(SCRIPTS / "staging-monitor.py", self.root)
        self.script("staging-status.sh", 'exit "$PROBE_RESULT"\n')
        self.script("run-monitor.py", """import importlib.util
import os
from pathlib import Path
import subprocess
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("monitor", Path(__file__).with_name("staging-monitor.py"))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)
invoke = monitor.subprocess.run
def run(command, **kwargs):
    if command[0] != "bash":
        if os.environ.get("CRASH_BEFORE_TRANSPORT") == "1":
            raise SystemExit(99)
        if os.environ.get("TRANSPORT_TIMEOUT") == "1":
            raise subprocess.TimeoutExpired(command, 40)
    return invoke(command, **kwargs)
with patch.object(monitor, "time", return_value=float(os.environ["FIXTURE_TIME"])), \\
        patch.object(monitor.subprocess, "run", side_effect=run):
    raise SystemExit(monitor.main())
""")
        transport = self.script("transport", """#!/usr/bin/env python3
import json, os, pathlib, sys
notice = json.load(sys.stdin)
root = pathlib.Path(os.environ["FIXTURE_DIR"])
# The retry deadline must already be durable before a provider can see the event.
assert json.loads((root / "state.json").read_text())["outbox"][0] == notice
with (root / "attempts").open("a") as log:
    log.write(json.dumps(notice) + "\\n")
sys.exit(int(os.environ["TRANSPORT_RESULT"]))
""")
        return (sys.executable, str(self.root / "run-monitor.py"), "--state", str(self.root / "state.json"),
                "--transport", str(transport))

    def attempts(self):
        log = self.root / "attempts"
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def poll(self, command, now, probe, transport=0, **extra):
        return self.execute(*command, "public", FIXTURE_TIME=str(now), PROBE_RESULT=str(probe),
                            TRANSPORT_RESULT=str(transport), **extra)

    def test_monitor_persists_retry_and_emits_one_alert_and_one_recovery(self):
        command = self.monitor_fixture()
        self.assertEqual(self.poll(command, 0, 1).returncode, 0)
        self.assertEqual(self.attempts(), [])
        self.assertEqual(self.poll(command, 300, 1, 75).returncode, 1)
        self.assertEqual(self.poll(command, 599, 0).returncode, 1)
        self.assertEqual(len(self.attempts()), 1)
        self.assertEqual(self.poll(command, 600, 0).returncode, 0)
        self.assertEqual(self.poll(command, 601, 0).returncode, 0)
        self.assertEqual(self.poll(command, 602, 0).returncode, 0)
        attempts = self.attempts()
        self.assertEqual([notice["status"] for notice in attempts], ["failed", "failed", "recovered"])
        self.assertEqual(attempts[0]["id"], attempts[1]["id"])

    def test_ambiguous_send_retries_same_id_then_delivers_queued_recovery(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        pending = self.poll(command, 300, 1, 76)
        self.assertEqual(pending.returncode, 1)
        self.assertIn("fbe_notice=retry", pending.stdout)
        self.assertEqual(self.poll(command, 599, 0).returncode, 1)
        self.assertEqual(len(self.attempts()), 1)
        self.assertEqual(self.poll(command, 600, 0).returncode, 0)
        self.assertEqual(self.poll(command, 601, 0).returncode, 0)
        attempts = self.attempts()
        self.assertEqual([notice["status"] for notice in attempts], ["failed", "failed", "recovered"])
        self.assertEqual(attempts[0]["id"], attempts[1]["id"])
        self.assertEqual(json.loads((self.root / "state.json").read_text())["outbox"], [])

    def test_retry_backoff_is_persistent_and_capped_at_one_hour(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        for index, (due, following) in enumerate(((0, 300), (300, 1200), (1200, 4800),
                                                 (4800, 8400), (8400, 12000))):
            self.assertEqual(self.poll(command, due, 1, 76).returncode, 1)
            notice = json.loads((self.root / "state.json").read_text())["outbox"][0]
            self.assertEqual(notice["attempts"], index + 1)
            self.assertEqual(notice["next_attempt_at"], following)
            self.assertEqual(self.poll(command, following - 1, 1, 76).returncode, 1)
            self.assertEqual(len(self.attempts()), index + 1)
        self.assertEqual(len({notice["id"] for notice in self.attempts()}), 1)

    def test_crash_after_persisting_send_resumes_at_its_deadline(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        interrupted = self.poll(command, 300, 1, CRASH_BEFORE_TRANSPORT="1")
        self.assertEqual(interrupted.returncode, 99)
        notice = json.loads((self.root / "state.json").read_text())["outbox"][0]
        self.assertEqual((notice["delivery"], notice["attempts"], notice["next_attempt_at"]),
                         ("sending", 1, 600))
        self.assertEqual(self.poll(command, 599, 1).returncode, 1)
        self.assertEqual(self.attempts(), [])
        self.assertEqual(self.poll(command, 600, 1).returncode, 0)
        self.assertEqual(self.attempts()[0]["id"], notice["id"])
        self.assertEqual(self.attempts()[0]["attempts"], 2)

    def test_transport_timeout_uses_the_same_scheduled_retry(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        self.assertEqual(self.poll(command, 300, 1, TRANSPORT_TIMEOUT="1").returncode, 1)
        notice = json.loads((self.root / "state.json").read_text())["outbox"][0]
        self.assertEqual((notice["delivery"], notice["next_attempt_at"]), ("sending", 600))
        self.assertEqual(self.poll(command, 599, 1).returncode, 1)
        self.assertEqual(self.attempts(), [])
        self.assertEqual(self.poll(command, 600, 1).returncode, 0)
        self.assertEqual(self.attempts()[0]["id"], notice["id"])

    def test_legacy_in_flight_event_waits_once_then_resumes_automatically(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        self.poll(command, 0, 1, 76)
        state_path = self.root / "state.json"
        state = json.loads(state_path.read_text())
        notice = state["outbox"][0]
        notice.pop("attempts")
        notice.pop("next_attempt_at")
        state_path.write_text(json.dumps(state))
        self.assertEqual(self.poll(command, 100, 1).returncode, 1)
        migrated = json.loads(state_path.read_text())["outbox"][0]
        self.assertEqual((migrated["attempts"], migrated["next_attempt_at"]), (1, 400))
        self.assertEqual(self.poll(command, 399, 1).returncode, 1)
        self.assertEqual(len(self.attempts()), 1)
        self.assertEqual(self.poll(command, 400, 1).returncode, 0)
        self.assertEqual(self.attempts()[1]["id"], notice["id"])

    def test_optional_reconciliation_can_clear_an_accepted_ambiguous_event(self):
        command = self.monitor_fixture()
        self.poll(command, 0, 1)
        self.poll(command, 300, 1, 76)
        identifier = self.attempts()[0]["id"]
        result = self.execute(*command, "--reconcile", identifier, "delivered", "public", FIXTURE_TIME="301")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.poll(command, 302, 0).returncode, 0)
        self.assertEqual([notice["status"] for notice in self.attempts()], ["failed", "recovered"])

    def test_graph_uses_only_configured_mailbox_and_classifies_send_result(self):
        spec = importlib.util.spec_from_file_location("staging_graph_mail", SCRIPTS / "staging-graph-mail.py")
        graph = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(graph)
        mailbox = "fbe-fixture@example.test"
        identifier = "00000000-0000-4000-8000-000000000001"
        (self.root / "graph").write_text(json.dumps({
            "tenant": identifier, "client": identifier, "client_secret": "fixture", "mailbox": mailbox,
        }))
        notice = {"id": identifier, "probe": "public", "status": "failed",
                  "at": "2026-11-25T15:40:33+00:00", "mailbox": "ignored@example.test"}
        for status, expected in ((202, 0), (429, 75), (503, 76)):
            accepted = io.BytesIO(b"")
            accepted.status = 202
            submit = accepted if status == 202 else HTTPError("fixture", status, "fixture", None, None)
            with patch.object(graph, "build_opener") as opener, patch.dict(
                    os.environ, {"CREDENTIALS_DIRECTORY": str(self.root)}), patch.object(
                    sys, "stdin", io.StringIO(json.dumps(notice))):
                invoke = opener.return_value.open
                invoke.side_effect = [io.BytesIO(b'{"access_token":"fixture"}'), submit]
                self.assertEqual(graph.send(), expected)
                token, mail = [call.args[0] for call in invoke.call_args_list]
                self.assertTrue(token.full_url.startswith("https://login.microsoftonline.com/"))
                self.assertEqual(mail.full_url, "https://graph.microsoft.com/v1.0/users/"
                                 "fbe-fixture%40example.test/sendMail")
                payload = json.loads(mail.data)
                self.assertEqual(payload["message"]["toRecipients"], [{"emailAddress": {"address": mailbox}}])
                self.assertIn(identifier, payload["message"]["subject"])


if __name__ == "__main__":
    unittest.main()

