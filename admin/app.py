"""vMule update admin — separate Python panel to publish, edit, and delete releases."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, flash, redirect, render_template, request, session, url_for

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

UPDATES_FILE = ROOT / "data" / "updates.json"

app = Flask(__name__)
app.secret_key = os.environ.get("ADMIN_SECRET", "change-me-to-a-long-random-string")

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_updates() -> list:
    if not UPDATES_FILE.exists():
        return []
    return json.loads(UPDATES_FILE.read_text(encoding="utf-8"))


def write_updates(items: list) -> None:
    UPDATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = UPDATES_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, indent=2), encoding="utf-8")
    tmp.replace(UPDATES_FILE)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            return redirect(url_for("login"))
        return fn(*args, **kwargs)

    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = request.form.get("username", "")
        password = request.form.get("password", "")
        if ADMIN_PASSWORD and user == ADMIN_USER and password == ADMIN_PASSWORD:
            session["admin"] = True
            return redirect(url_for("index"))
        flash("Invalid username or password.")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    items = sorted(read_updates(), key=lambda u: u.get("updated_at") or "", reverse=True)
    return render_template("list.html", updates=items)


def form_to_item(existing: dict | None = None) -> dict:
    item = dict(existing or {})
    item.update(
        {
            "id": item.get("id") or f"upd-{uuid.uuid4().hex[:10]}",
            "version": request.form.get("version", "").strip(),
            "channel": request.form.get("channel", "stable").strip(),
            "title": request.form.get("title", "").strip(),
            "changelog": request.form.get("changelog", "").strip(),
            "download_url": request.form.get("download_url", "").strip(),
            "filename": request.form.get("filename", "").strip(),
            "size": request.form.get("size", "").strip(),
            "published": request.form.get("published") == "on",
            "updated_at": now_iso(),
        }
    )
    item.setdefault("created_at", now_iso())
    return item


@app.route("/new", methods=["GET", "POST"])
@login_required
def new_update():
    if request.method == "POST":
        items = read_updates()
        items.insert(0, form_to_item())
        write_updates(items)
        flash("Update created.")
        return redirect(url_for("index"))
    return render_template("edit.html", item=None)


@app.route("/edit/<item_id>", methods=["GET", "POST"])
@login_required
def edit_update(item_id: str):
    items = read_updates()
    item = next((u for u in items if u["id"] == item_id), None)
    if not item:
        flash("Update not found.")
        return redirect(url_for("index"))
    if request.method == "POST":
        items = [form_to_item(item) if u["id"] == item_id else u for u in items]
        write_updates(items)
        flash("Update saved.")
        return redirect(url_for("index"))
    return render_template("edit.html", item=item)


@app.route("/publish/<item_id>", methods=["POST"])
@login_required
def publish(item_id: str):
    flag = request.form.get("published") == "1"
    items = read_updates()
    for u in items:
        if u["id"] == item_id:
            u["published"] = flag
            u["updated_at"] = now_iso()
    write_updates(items)
    flash("Published." if flag else "Unpublished.")
    return redirect(url_for("index"))


@app.route("/delete/<item_id>", methods=["POST"])
@login_required
def delete_update(item_id: str):
    items = [u for u in read_updates() if u["id"] != item_id]
    write_updates(items)
    flash("Update deleted.")
    return redirect(url_for("index"))


if __name__ == "__main__":
    port = int(os.environ.get("ADMIN_PORT", "5050"))
    print(f"vMule update admin  http://127.0.0.1:{port}/")
    print("Sign in with the credentials from your environment file.")
    app.run(host="127.0.0.1", port=port, debug=True)
