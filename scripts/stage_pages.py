#!/usr/bin/env python3
"""Stage ONLY static website files for GitHub Pages.

No bundler; application files are copied unchanged. By default guestbook is
deliberately excluded until a separately approved release enables it.
Never publish the Worker backend, D1 migrations, admin sources or local files.
"""
from pathlib import Path
import argparse
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
ROOT_FILES = (
    "index.html", "palette.html", "guide.html", "sw.js",
    "manifest.webmanifest", "icon.svg",
)
STATIC_DIRS = ("css", "js", "data", "assets")
GUESTBOOK_ASSETS = {
    "css/guestbook.css", "js/guestbook.js", "js/guestbook-config.js"
}


def stage(include_guestbook: bool = False) -> list[str]:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    copied = []
    for name in ROOT_FILES:
        source = ROOT / name
        if not source.is_file():
            raise FileNotFoundError(f"Required website file is missing: {name}")
        shutil.copy2(source, OUT / name)
        copied.append(name)
    for subdir in STATIC_DIRS:
        source_dir = ROOT / subdir
        if not source_dir.is_dir():
            continue
        for src in source_dir.rglob("*"):
            if not src.is_file():
                continue
            relative = src.relative_to(ROOT).as_posix()
            if not include_guestbook and relative in GUESTBOOK_ASSETS:
                continue
            destination = OUT / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, destination)
            copied.append(relative)
    if include_guestbook:
        src = ROOT / "guestbook.html"
        if not src.is_file():
            raise FileNotFoundError("Approved guestbook page not found")
        shutil.copy2(src, OUT / "guestbook.html")
        copied.append("guestbook.html")
    else:
        assert not (OUT / "guestbook.html").exists()
        assert all(not (OUT / filename).exists() for filename in GUESTBOOK_ASSETS)

    assert not (OUT / "guestbook-worker").exists()
    assert not (OUT / ".github").exists()
    assert not (OUT / "docs").exists()
    return copied


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stage static GitHub Pages assets")
    parser.add_argument(
        "--include-guestbook", action="store_true",
        help="EXPLICIT public launch only; requires separate security approval"
    )
    args = parser.parse_args()
    created = stage(args.include_guestbook)
    print(f"Staged {len(created)} static assets, guestbook={'included' if args.include_guestbook else 'excluded'}")
