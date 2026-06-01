# Productivity Tracker

Local-first React tracker for tasks, routines, goals, habits, finance, weekly review, analytics, Bible verse, JSON backup, and Excel export.

## Daily Use

1. Open a terminal in this folder.
2. Run `npm run dev`.
3. Open `http://127.0.0.1:5173`.
4. Start on Today, spawn recurring tasks if needed, plan the day, and keep the tab open while working.
5. Use Export / Backup at the end of the week or before changing browsers/devices.

## Commands

- `npm run dev` starts Vite with hot reload for editing.
- `npm run build` creates the production build in `dist/`.
- `npm run serve` builds first, then previews the production build.
- `npm run preview` previews an existing `dist/` build.

## Local Data

The app stores its SQLite database inside browser `localStorage` under `pt_sqlite_db`. That keeps everything local to this browser profile. Use JSON backup before clearing browser data, switching browsers, or moving machines.

The dev script creates a temporary Windows junction because this project path contains `%`, which Vite 8 cannot serve directly in dev mode.
