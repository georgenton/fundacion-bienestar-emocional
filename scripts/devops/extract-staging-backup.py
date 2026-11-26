"""Extract an authenticated and decrypted FBE archive into an empty private directory."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile

CORE = {"database.dump", "captured-at", "api.env", "migration.env", "roles.sql", "release.json"}
OPTIONAL = {"recovery.txt"}
KEY = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
SHA = re.compile(r"[0-9a-f]{64}")


def extract(archive, destination):
    if destination.is_symlink() or not destination.is_dir() or any(destination.iterdir()):
        raise ValueError("expected an empty private restore directory")
    stat = destination.stat()
    if stat.st_uid != os.getuid() or stat.st_mode & 0o077:
        raise ValueError("restore directory must be private and owned by its operator")
    with tarfile.open(archive, "r:") as bundle:
        entries = bundle.getmembers()
        by_name = {entry.name: entry for entry in entries}
        if len(by_name) != len(entries) or not CORE <= by_name.keys():
            raise ValueError("duplicate or missing recovery material")
        allowed = CORE | OPTIONAL
        files = []
        if "attachments.json" in by_name:
            manifest = by_name["attachments.json"]
            if not manifest.isfile() or manifest.size > 256 * 1024:
                raise ValueError("invalid file manifest")
            files = json.load(bundle.extractfile(manifest))
            if not isinstance(files, list):
                raise ValueError("invalid attachment list")
            seen = set()
            for row in files:
                if (not isinstance(row, dict) or row.keys() != {"key", "sha256", "bytes"} or
                        not isinstance(row["key"], str) or not KEY.fullmatch(row["key"]) or
                        not isinstance(row["sha256"], str) or not SHA.fullmatch(row["sha256"]) or
                        type(row["bytes"]) is not int or not 1 <= row["bytes"] <= 16384 or row["key"] in seen):
                    raise ValueError("invalid attachment reference")
                seen.add(row["key"])
            if sum(row["bytes"] for row in files) > 98304:
                raise ValueError("attachment bundle exceeds its staging limit")
            if "attachments" not in by_name or not by_name["attachments"].isdir():
                raise ValueError("expected attachment directory")
            allowed |= {"attachments", "attachments.json"} | {f"attachments/{key}" for key in seen}
        if set(by_name) - allowed:
            raise ValueError("unexpected archive entries")
        for row in files:
            entry = by_name.get(f'attachments/{row["key"]}')
            if not entry or not entry.isfile() or entry.size != row["bytes"] or (
                    hashlib.sha256(bundle.extractfile(entry).read()).hexdigest() != row["sha256"]):
                raise ValueError("attachment does not match its snapshot")
        if any(not entry.isfile() for entry in entries if entry.name != "attachments"):
            raise ValueError("expected regular files")
        if "attachments" in by_name:
            (destination / "attachments").mkdir(mode=0o700)
        for entry in entries:
            if entry.name == "attachments":
                continue
            with (destination / entry.name).open("xb") as output:
                shutil.copyfileobj(bundle.extractfile(entry), output)
    return len(files)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        if len(sys.argv) != 3:
            raise ValueError("arguments")
        count = extract(Path(sys.argv[1]), Path(sys.argv[2]))
    except (OSError, ValueError, tarfile.TarError):
        raise SystemExit("FBE archive validation failed")
    print(f"restored_attachment_hashes={count}")
