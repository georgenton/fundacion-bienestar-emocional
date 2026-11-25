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
        transport = self.script("transport", """#!/usr/bin/env python3
import json, os, pathlib, sys
notice = json.load(sys.stdin)
with (pathlib.Path(os.environ["FIXTURE_DIR"]) / "attempts").open("a") as log:
    log.write(json.dumps(notice) + "\\n")
sys.exit(int(os.environ["TRANSPORT_RESULT"]))
""")
        return (sys.executable, str(self.root / "staging-monitor.py"), "--state", str(self.root / "state.json"),
                "--transport", str(transport))

    def attempts(self):
        log = self.root / "attempts"
        return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def test_monitor_persists_retry_and_emits_one_alert_and_one_recovery(self):
        command = self.monitor_fixture()

        def poll(probe, transport=0):
            return self.execute(*command, "public", PROBE_RESULT=str(probe), TRANSPORT_RESULT=str(transport))

        self.assertEqual(poll(1).returncode, 0)
        self.assertEqual(self.attempts(), [])
        self.assertEqual(poll(1, 75).returncode, 1)
        self.assertEqual(poll(0).returncode, 0)  # Recovery queues behind the retried incident.
        self.assertEqual(poll(0).returncode, 0)
        self.assertEqual(poll(0).returncode, 0)
        attempts = self.attempts()
        self.assertEqual([notice["status"] for notice in attempts], ["failed", "failed", "recovered"])
        self.assertEqual(attempts[0]["id"], attempts[1]["id"])

    def test_ambiguous_send_waits_for_reconciliation_without_duplicate(self):
        command = self.monitor_fixture()
        self.execute(*command, "public", PROBE_RESULT="1", TRANSPORT_RESULT="76")
        pending = self.execute(*command, "public", PROBE_RESULT="1", TRANSPORT_RESULT="76")
        self.assertEqual(pending.returncode, 1)
        self.assertIn("fbe_notice=reconcile", pending.stdout)
        self.execute(*command, "public", PROBE_RESULT="0", TRANSPORT_RESULT="0")
        self.assertEqual(len(self.attempts()), 1)
        identifier = self.attempts()[0]["id"]
        result = self.execute(*command, "--reconcile", identifier, "delivered", "public")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.execute(*command, "public", PROBE_RESULT="0", TRANSPORT_RESULT="0")
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
