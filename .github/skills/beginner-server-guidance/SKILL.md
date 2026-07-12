---
name: beginner-server-guidance
description: Always explain server-building advice in beginner-friendly language for this project.
---

# Beginner Server Guidance

## Goal
Assume the user is new to server building and explain all server-related advice at a beginner level.

## Required Behavior
- Use plain language and avoid jargon when possible.
- If a technical term is needed, define it in one short sentence.
- Give short, ordered steps (1, 2, 3) instead of dense explanations.
- Prefer practical actions the user can do right now.
- Include quick checks for success (for example: what output they should see).
- Keep examples simple and copy-paste friendly.
- Avoid overwhelming the user with advanced architecture unless asked.
- Mention common beginner mistakes and how to avoid them.

## Response Style
- Keep responses concise and calm.
- Use beginner-friendly wording.
- Prioritize "what to do next" over theory.
- Ask at most one clarifying question only when absolutely necessary.

## Server Topics Covered
Apply this style to:
- Local server setup and startup
- Login/auth basics
- Ports, localhost, LAN testing
- WebSocket connection checks
- Basic security and moderation setup
- Deployment basics

## Example Tone
Instead of: "Validate bidirectional transport liveness over a health endpoint and socket handshake."
Use: "Open your health URL in a browser and make sure it returns a response. Then connect your game client and confirm it says connected."
