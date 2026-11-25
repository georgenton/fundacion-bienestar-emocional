#!/usr/bin/env python3
"""Send a FBE monitor event using an Exchange-scoped application."""

import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import UUID


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def send():
    try:
        credentials = Path(os.environ["CREDENTIALS_DIRECTORY"]) / "graph"
        config = json.loads(credentials.read_text())
        tenant = str(UUID(config["tenant"]))
        client = str(UUID(config["client"]))
        mailbox = config["mailbox"]
        if not re.fullmatch(r"[^\s<>@]+@[^\s<>@]+", mailbox):
            return 75
        notice = json.load(sys.stdin)
        identifier = str(UUID(notice["id"]))
        probe = {"public": "HTTPS público", "host": "capacidad y respaldo"}[notice["probe"]]
        transition = {"failed": "Fallo", "recovered": "Recuperación"}[notice["status"]]
        api = build_opener(ProxyHandler({}), RejectRedirects())
        token = Request(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                        data=urlencode({
                            "client_id": client,
                            "client_secret": config["client_secret"],
                            "grant_type": "client_credentials",
                            "scope": "https://graph.microsoft.com/.default",
                        }).encode())
        with api.open(token, timeout=10) as response:
            access_token = json.load(response)["access_token"]
        if not isinstance(access_token, str) or not access_token or any(c.isspace() for c in access_token):
            return 75
    except (OSError, ValueError, TypeError, KeyError):
        return 75

    data = {
        "message": {
            "subject": f"FBE staging | {transition} | {probe} | {identifier}",
            "body": {
                "contentType": "Text",
                "content": f"FBE staging sintético\n{transition} · {probe}\nUTC {notice['at']}\nID {identifier}",
            },
            "toRecipients": [{"emailAddress": {"address": mailbox}}],
        },
        "saveToSentItems": True,
    }
    request = Request(f"https://graph.microsoft.com/v1.0/users/{quote(mailbox, safe='')}/sendMail",
                      data=json.dumps(data).encode(),
                      headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json",
                               "client-request-id": identifier, "return-client-request-id": "true"})
    try:
        with api.open(request, timeout=12) as response:
            return 0 if response.status == 202 else 76
    except HTTPError as error:
        return 75 if error.code in (400, 401, 403, 404, 413, 422, 429) else 76
    except OSError:
        return 76


if __name__ == "__main__":
    raise SystemExit(send())
