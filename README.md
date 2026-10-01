# Ecommerce Backend

This repository currently contains a standalone Express health-check backend.
Database-backed ecommerce features are disabled.

## Run locally

From `backend/`, run `npm install` and then `npm start`.

The health endpoint is `GET /api/health` and returns a JSON status message.

## Deploy on Render

Create a Web Service from this repository with root directory `backend`, build
command `npm install`, and start command `npm start`. Render supplies `PORT`.
