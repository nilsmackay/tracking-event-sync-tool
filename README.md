# Event Tracking Sync Tool

A React-based web application for synchronizing event data with tracking data. This tool allows you to visually align events with tracking frames and export the synchronized timestamps.

## Features

- **Parquet File Upload**: Upload tracking and events data as parquet files
- **Pitch Visualization**: Interactive SVG pitch display showing player positions and event markers
- **Frame Navigation**: Navigate through tracking frames with ±1, ±5, ±10 frame buttons
- **Event Navigation**: Jump between events, skip to next unsynced event
- **Persistent Storage**: All data persisted in IndexedDB - survives page refreshes
- **JSON Export**: Download synchronized results as JSON
- **GitHub Pages Ready**: Configured for deployment to GitHub Pages

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Usage

1. **Upload Files**: 
   - Upload a tracking parquet file (must contain: `period_id`, `matched_time`, `team_opta_id`, `jersey_no`, `pos_x`, `pos_y`, `is_ball`)
   - Upload an events parquet file (must contain: `opta_event_id`, `period_id`, `matched_time`, `team_id`, `jersey_no`, `x`, `y`, optionally `pass_end_x`, `pass_end_y`)

2. **Sync Events**:
   - Use frame navigation buttons to align the tracking frame with the event
   - Click "Sync & Next" to save the synchronization and move to the next event
   - Click "Skip" to skip events without tracking data

3. **Export Results**:
   - Click "Download JSON" at any time to export synchronized results
   - Results are automatically saved to IndexedDB

## Data Persistence

All uploaded data and sync results are stored in IndexedDB. Data persists across page refreshes until explicitly reset using the "Reset" button.

## Deployment

The app is configured for GitHub Pages deployment. Push to the `main` branch and GitHub Actions will automatically build and deploy to GitHub Pages.

## License

Apache License 2.0
