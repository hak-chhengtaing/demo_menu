# DineEasy Installation & Deployment Guide

## Requirements
- Node.js 22+ (includes built-in `node:sqlite`)
- npm 10+

## Local Development Setup
1. Copy `.env.example` to `.env` and configure `SESSION_SECRET`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the full-stack development server (Express + WebSockets + Vite on port 3000):
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser. The relational SQLite database (`database/restaurant.db`) is automatically migrated and seeded on first startup.

## Production Build & Deployment
1. Build the frontend bundle:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```
3. Or run with Docker Compose:
   ```bash
   docker compose up -d --build
   ```

## Default Demo Accounts
- **Admin**: `admin` / `admin123`
- **Staff**: `sokha` / `staff123`
- **Chef**: `chef` / `chef123`

Change all default passwords in Admin > Staff & Users before deploying to a live restaurant.
