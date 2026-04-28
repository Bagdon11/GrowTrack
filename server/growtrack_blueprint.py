"""
GrowTrack API Blueprint
=======================
Drop this file into your Flask project and register it in your app factory:

    from growtrack_blueprint import growtrack_bp
    app.register_blueprint(growtrack_bp)

Environment variables (add to Railway):
    APP_DB_PATH          — path to your SQLite DB (already set)
    GROWTRACK_ADMIN_KEY  — a long random secret for the admin endpoints
                           generate one with: python -c "import secrets; print(secrets.token_hex(32))"

Endpoints:
    GET  /api/growtrack/plants              — list all approved community plants
    POST /api/growtrack/submit              — submit a new plant for review
    GET  /api/growtrack/version             — latest APK version + download URL
    GET  /api/growtrack/admin/submissions   — list pending submissions  [admin]
    POST /api/growtrack/admin/approve/<id>  — approve a submission      [admin]
    POST /api/growtrack/admin/reject/<id>   — reject a submission       [admin]
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from typing import Any

from flask import Blueprint, Response, g, jsonify, request

growtrack_bp = Blueprint("growtrack", __name__, url_prefix="/api/growtrack")

# ── Database connection ───────────────────────────────────────────────────────

DB_PATH: str = os.environ.get("APP_DB_PATH", "platform_data.db")


def get_db() -> sqlite3.Connection:
    """Return the per-request SQLite connection (reuses Flask's g object)."""
    if "growtrack_db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        g.growtrack_db = conn
    return g.growtrack_db  # type: ignore[return-value]


@growtrack_bp.teardown_app_request  # type: ignore[attr-defined]
def close_db(exc: BaseException | None = None) -> None:
    db = g.pop("growtrack_db", None)
    if db is not None:
        db.close()


# ── Schema (idempotent — safe to run on every startup) ───────────────────────

def init_growtrack_schema() -> None:
    """Create GrowTrack tables if they do not exist.
    Call this once from your app factory after register_blueprint().
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS growtrack_plants (
            id           TEXT PRIMARY KEY,          -- stable UUID, never changes
            name         TEXT NOT NULL,
            variety      TEXT,
            base_temp    REAL NOT NULL,
            gdd_to_maturity        REAL NOT NULL,
            days_to_germination    INTEGER NOT NULL DEFAULT 7,
            water_interval_days    INTEGER NOT NULL DEFAULT 3,
            fertilise_interval_days INTEGER NOT NULL DEFAULT 14,
            spacing_cm   INTEGER,
            description  TEXT NOT NULL,
            season       TEXT NOT NULL,
            frost_tolerant INTEGER NOT NULL DEFAULT 0,
            approved_at  TEXT NOT NULL,
            approved_by  TEXT NOT NULL DEFAULT 'admin'
        );

        CREATE TABLE IF NOT EXISTS growtrack_submissions (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            variety      TEXT,
            base_temp    REAL NOT NULL,
            gdd_to_maturity        REAL NOT NULL,
            days_to_germination    INTEGER NOT NULL,
            water_interval_days    INTEGER NOT NULL,
            fertilise_interval_days INTEGER NOT NULL,
            spacing_cm   INTEGER,
            description  TEXT NOT NULL,
            season       TEXT NOT NULL,
            frost_tolerant INTEGER NOT NULL DEFAULT 0,
            region       TEXT,
            submitted_at TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending', 'approved', 'rejected')),
            reviewed_at  TEXT,
            reviewed_by  TEXT
        );
    """)
    conn.commit()
    conn.close()


# ── Auth helper ───────────────────────────────────────────────────────────────

def require_admin_key(f):  # type: ignore[no-untyped-def]
    """Decorator: rejects requests without the correct X-Admin-Key header."""
    @wraps(f)
    def decorated(*args: Any, **kwargs: Any) -> Any:
        admin_key = os.environ.get("GROWTRACK_ADMIN_KEY", "")
        if not admin_key:
            return jsonify({"error": "Admin key not configured on server"}), 503
        provided = request.headers.get("X-Admin-Key", "")
        # Constant-time comparison to prevent timing attacks
        if not secrets.compare_digest(provided, admin_key):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ── Validation ────────────────────────────────────────────────────────────────

VALID_SEASONS = {"spring", "summer", "autumn", "winter", "fruit"}


def validate_plant_fields(data: dict) -> list[str]:  # type: ignore[type-arg]
    """Return a list of validation error strings. Empty = valid."""
    errors: list[str] = []

    if not isinstance(data.get("name"), str) or not data["name"].strip():
        errors.append("name is required")

    gdd = data.get("gdd_to_maturity")
    if not isinstance(gdd, (int, float)) or gdd <= 0:
        errors.append("gdd_to_maturity must be a positive number")

    base = data.get("base_temp")
    if not isinstance(base, (int, float)) or not (-10 <= base <= 30):
        errors.append("base_temp must be between -10 and 30")

    for field in ("days_to_germination", "water_interval_days", "fertilise_interval_days"):
        val = data.get(field)
        if not isinstance(val, int) or val <= 0:
            errors.append(f"{field} must be a positive integer")

    desc = data.get("description")
    if not isinstance(desc, str) or not desc.strip():
        errors.append("description is required")

    season = data.get("season")
    if not isinstance(season, str) or not season.strip():
        errors.append("season is required")
    else:
        provided_seasons = {s.strip() for s in season.split(",")}
        invalid = provided_seasons - VALID_SEASONS
        if invalid:
            errors.append(f"invalid season(s): {', '.join(invalid)}")

    frost = data.get("frost_tolerant")
    if frost not in (0, 1):
        errors.append("frost_tolerant must be 0 or 1")

    return errors


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Public endpoints ──────────────────────────────────────────────────────────

@growtrack_bp.route("/plants", methods=["GET"])
def list_plants() -> Response:
    """Return all approved community plants as JSON.
    The app fetches this every 4 hours to update its local database.
    """
    db = get_db()
    rows = db.execute(
        "SELECT * FROM growtrack_plants ORDER BY name ASC"
    ).fetchall()
    plants = [dict(row) for row in rows]
    return jsonify(plants)


@growtrack_bp.route("/submit", methods=["POST"])
def submit_plant() -> Response:
    """Accept a plant submission from the app for human review.
    All fields are validated before storing.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON body"}), 400

    errors = validate_plant_fields(data)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    # Sanitise string inputs — strip whitespace, cap lengths
    def clean(val: Any, max_len: int = 500) -> str | None:
        if not isinstance(val, str):
            return None
        return val.strip()[:max_len] or None

    submission_id = str(uuid.uuid4())
    db = get_db()
    db.execute(
        """
        INSERT INTO growtrack_submissions
            (id, name, variety, base_temp, gdd_to_maturity,
             days_to_germination, water_interval_days, fertilise_interval_days,
             spacing_cm, description, season, frost_tolerant,
             region, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            submission_id,
            clean(data["name"], 100),
            clean(data.get("variety"), 100),
            float(data["base_temp"]),
            float(data["gdd_to_maturity"]),
            int(data["days_to_germination"]),
            int(data["water_interval_days"]),
            int(data["fertilise_interval_days"]),
            int(data["spacing_cm"]) if isinstance(data.get("spacing_cm"), int) else None,
            clean(data["description"], 1000),
            clean(data["season"], 100),
            int(data["frost_tolerant"]),
            clean(data.get("region"), 100),
            _now_utc(),
        ),
    )
    db.commit()
    return jsonify({"ok": True, "id": submission_id}), 201


@growtrack_bp.route("/version", methods=["GET"])
def version_info() -> Response:
    """Return the current published APK version and download URL.
    Set these via Railway environment variables when you publish a release:
        GROWTRACK_VERSION      e.g. "1.0.1"
        GROWTRACK_APK_URL      e.g. "https://github.com/.../releases/download/v1.0.1/app-release.apk"
    """
    return jsonify({
        "version": os.environ.get("GROWTRACK_VERSION", "1.0.0"),
        "apk_url": os.environ.get("GROWTRACK_APK_URL", None),
    })


# ── Admin endpoints ───────────────────────────────────────────────────────────

@growtrack_bp.route("/admin/submissions", methods=["GET"])
@require_admin_key
def admin_list_submissions() -> Response:
    """List all pending submissions. Pass ?status=approved|rejected to filter."""
    status = request.args.get("status", "pending")
    if status not in ("pending", "approved", "rejected"):
        status = "pending"
    db = get_db()
    rows = db.execute(
        "SELECT * FROM growtrack_submissions WHERE status = ? ORDER BY submitted_at DESC",
        (status,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@growtrack_bp.route("/admin/approve/<submission_id>", methods=["POST"])
@require_admin_key
def admin_approve(submission_id: str) -> Response:
    """Approve a submission — copies it into growtrack_plants with a stable UUID."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM growtrack_submissions WHERE id = ? AND status = 'pending'",
        (submission_id,),
    ).fetchone()

    if not row:
        return jsonify({"error": "Submission not found or already reviewed"}), 404

    plant_id = str(uuid.uuid4())
    now = _now_utc()

    db.execute(
        """
        INSERT INTO growtrack_plants
            (id, name, variety, base_temp, gdd_to_maturity,
             days_to_germination, water_interval_days, fertilise_interval_days,
             spacing_cm, description, season, frost_tolerant,
             approved_at, approved_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
        """,
        (
            plant_id,
            row["name"], row["variety"], row["base_temp"], row["gdd_to_maturity"],
            row["days_to_germination"], row["water_interval_days"],
            row["fertilise_interval_days"], row["spacing_cm"],
            row["description"], row["season"], row["frost_tolerant"],
            now,
        ),
    )
    db.execute(
        "UPDATE growtrack_submissions SET status = 'approved', reviewed_at = ? WHERE id = ?",
        (now, submission_id),
    )
    db.commit()
    return jsonify({"ok": True, "plant_id": plant_id})


@growtrack_bp.route("/admin/reject/<submission_id>", methods=["POST"])
@require_admin_key
def admin_reject(submission_id: str) -> Response:
    """Reject a submission."""
    db = get_db()
    result = db.execute(
        "UPDATE growtrack_submissions SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = 'pending'",
        (_now_utc(), submission_id),
    )
    db.commit()
    if result.rowcount == 0:
        return jsonify({"error": "Submission not found or already reviewed"}), 404
    return jsonify({"ok": True})
