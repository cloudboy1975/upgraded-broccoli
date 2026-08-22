#!/usr/bin/env python3
"""Render tutorial/lessons/*.html from tutorial/build/lessons.json.

This is an authoring convenience only - the output is plain static HTML,
same as every other page in this repo. Nobody needs to run this script
to view the site; it exists so a future lesson can be added by editing
lessons.json instead of hand-writing another full HTML page.

Usage: python3 tutorial/build/generate.py
(run from anywhere - paths below are relative to this file)
"""
import html
import json
import os

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
TUTORIAL_DIR = os.path.dirname(BUILD_DIR)

with open(os.path.join(BUILD_DIR, "lessons.json")) as f:
    lessons = json.load(f)

with open(os.path.join(BUILD_DIR, "template.html")) as f:
    template = f.read()

by_id = {l["id"]: l for l in lessons}


def render_nav_slot(side, lesson):
    """side is 'prev' or 'next'."""
    other_id = lesson.get(side + "Id")
    if other_id:
        other = by_id[other_id]
        label = "Prev" if side == "prev" else "Next"
        arrow = "&lsaquo; " if side == "prev" else ""
        arrow_after = " &rsaquo;" if side == "next" else ""
        text = f"{arrow}{other['number']}. {other['title']}{arrow_after}"
        align = ' class="next"' if side == "next" else ""
        return f'      <a{align} href="{other_id}.html"><span class="nav-label">{label}</span>{text}</a>'
    if side == "prev":
        # First lesson overall: an invisible placeholder keeps the flexbox spacing even.
        return '      <span class="placeholder">placeholder</span>'
    # Last-written lesson: a non-link "coming soon" placeholder, never a dangling href.
    pending_title = lesson.get("nextPendingTitle")
    if not pending_title:
        return '      <span class="placeholder">placeholder</span>'
    return (
        '      <span class="next placeholder" style="text-align:right; padding: 12px 14px; font-size: 0.85rem;">\n'
        f'        <span class="nav-label">Next</span>{pending_title} &mdash; coming soon\n'
        '      </span>'
    )


def render_lesson(lesson):
    checkpoint_path = os.path.join(TUTORIAL_DIR, "checkpoints", lesson["id"] + ".html")
    with open(checkpoint_path) as f:
        checkpoint_src = f.read()
    full_source = html.escape(checkpoint_src)

    group_label = "Core" if lesson["group"] == "core" else "Bonus"
    kicker_class = "" if lesson["group"] == "core" else " bonus"
    kicker = f'{group_label} &middot; Lesson {lesson["number"]} of {lesson["groupTotal"]}'

    out = template
    out = out.replace("__TITLE__", f'{lesson["number"]}. {lesson["title"]}')
    out = out.replace("__KICKER_CLASS__", kicker_class)
    out = out.replace("__KICKER__", kicker)
    out = out.replace("__H1__", lesson["title"])
    out = out.replace("__SUBTITLE__", lesson["subtitle"])
    out = out.replace("__BODY__", lesson["body"].rstrip())
    out = out.replace("__DEMO_NOTE__", lesson["demoNote"])
    out = out.replace("__CHECKPOINT__", lesson["id"])
    out = out.replace("__NUMBER__", str(lesson["number"]))
    out = out.replace("__FULL_SOURCE__", full_source)
    out = out.replace("__NAV_PREV__", render_nav_slot("prev", lesson))
    out = out.replace("__NAV_NEXT__", render_nav_slot("next", lesson))
    return out


def main():
    lessons_out_dir = os.path.join(TUTORIAL_DIR, "lessons")
    os.makedirs(lessons_out_dir, exist_ok=True)
    for lesson in lessons:
        rendered = render_lesson(lesson)
        out_path = os.path.join(lessons_out_dir, lesson["id"] + ".html")
        with open(out_path, "w") as f:
            f.write(rendered)
        print("wrote", out_path)


if __name__ == "__main__":
    main()
