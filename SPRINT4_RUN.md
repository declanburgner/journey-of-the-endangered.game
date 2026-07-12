# Sprint 4 Run Guide

## What Sprint 4 Adds
- News page for all players
- Admin news posting
- Bug/player report submission from main page
- News feed includes report events with reason and timestamp

## 1. Start server
- Run:
  - npm run dev

## 2. Login
- Open:
  - http://localhost:3000
- Use test credentials from your `.env` values.

## 3. Main page checks
- Open main page after login.
- Confirm buttons exist:
  - Start Game
  - News
  - Submit Report

## 4. Submit a report
- On main page, choose report type.
- Enter a reason.
- Click Submit Report.
- Expected result: confirmation message says report is submitted.

## 5. Open news page
- Click News button, or open:
  - http://localhost:3000/news.html
- Expected result:
  - Feed shows news entries and report events.
  - Report events include reporter, reported user, reason, and time.

## 6. Admin post test
- Log in as admin user (`ADMIN_USERNAME` in `.env`, default `alice`).
- On news page, admin panel should be visible.
- Publish a post with title/body.
- Expected result: post appears in feed.

## 7. Non-admin test
- Log in as non-admin user (default `bob`).
- Open news page.
- Expected result: feed is visible but admin post panel is hidden.
