import os
import json
import hmac
import hashlib
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app, origins=["http://localhost:5001", "http://127.0.0.1:5001", "https://*.railway.app"])

BASE_DIR = Path(__file__).parent
POSTS_FILE = BASE_DIR / "posts" / "posts.json"
UPLOADS_DIR = BASE_DIR / "uploads"

ADMIN_USER = os.getenv("ADMIN_USER", "giorgio")
ADMIN_PASS = os.getenv("ADMIN_PASS", "")
SECRET_KEY = os.getenv("SECRET_KEY", "changeme")

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".webm"}
MAX_CONTENT_MB = 50

# ── helpers ──────────────────────────────────────────────────────────────────

def _make_token(user: str) -> str:
    """Generate a simple HMAC token for the given username."""
    msg = f"{user}:{SECRET_KEY}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def _verify_token(token: str) -> bool:
    expected = _make_token(ADMIN_USER)
    return hmac.compare_digest(token, expected)


def _read_posts() -> list:
    if not POSTS_FILE.exists():
        return []
    with open(POSTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_posts(posts: list) -> None:
    with open(POSTS_FILE, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


def _auth_required():
    """Return (True, None) if request is authorised, else (False, response)."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return False, jsonify({"error": "Non autorizzato"}), 401
    token = header[len("Bearer "):]
    if not _verify_token(token):
        return False, jsonify({"error": "Token non valido"}), 401
    return True, None, None


# ── routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_file(BASE_DIR / "index.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOADS_DIR, filename)


@app.post("/api/login")
def api_login():
    data = request.get_json(silent=True) or {}
    user = data.get("user", "").strip()
    password = data.get("pass", "")

    if user != ADMIN_USER or password != ADMIN_PASS:
        return jsonify({"error": "Credenziali errate"}), 401

    token = _make_token(user)
    return jsonify({"token": token})


@app.get("/api/posts")
def api_get_posts():
    posts = _read_posts()
    # newest first
    posts.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return jsonify(posts)


@app.post("/api/posts")
def api_create_post():
    ok, *err = _auth_required()
    if not ok:
        return err[0], err[1]

    # check size
    if request.content_length and request.content_length > MAX_CONTENT_MB * 1024 * 1024:
        return jsonify({"error": f"File troppo grande (max {MAX_CONTENT_MB}MB)"}), 413

    title = request.form.get("title", "").strip()
    body = request.form.get("body", "").strip()

    if not title:
        return jsonify({"error": "Il titolo è obbligatorio"}), 400

    media_url = None
    media_type = None
    file = request.files.get("media")

    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_IMAGE_EXT | ALLOWED_VIDEO_EXT:
            return jsonify({"error": "Formato file non supportato"}), 400

        filename = f"{uuid.uuid4().hex}{ext}"
        UPLOADS_DIR.mkdir(exist_ok=True)
        file.save(UPLOADS_DIR / filename)
        media_url = f"/uploads/{filename}"
        media_type = "image" if ext in ALLOWED_IMAGE_EXT else "video"

    post = {
        "id": uuid.uuid4().hex,
        "title": title,
        "body": body,
        "media_url": media_url,
        "media_type": media_type,
        "created_at": datetime.utcnow().isoformat(),
    }

    posts = _read_posts()
    posts.append(post)
    _write_posts(posts)

    return jsonify(post), 201


@app.delete("/api/posts/<post_id>")
def api_delete_post(post_id):
    ok, *err = _auth_required()
    if not ok:
        return err[0], err[1]

    posts = _read_posts()
    post = next((p for p in posts if p["id"] == post_id), None)
    if not post:
        return jsonify({"error": "Post non trovato"}), 404

    # remove media file if present
    if post.get("media_url"):
        media_path = BASE_DIR / post["media_url"].lstrip("/")
        if media_path.exists():
            media_path.unlink()

    posts = [p for p in posts if p["id"] != post_id]
    _write_posts(posts)
    return jsonify({"ok": True})


# ── run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
