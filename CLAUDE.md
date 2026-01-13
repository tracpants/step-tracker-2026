# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a step tracking application that displays Garmin Connect data as a GitHub-style heatmap. The application uses a modern hybrid architecture:

**Data Pipeline**: `update_steps.py` (Python) → Garmin API → Cloudflare R2 Storage
**Frontend**: Static HTML/CSS/JavaScript → Cal-Heatmap library → Dynamic tooltips/popovers

### Key Architecture Components

1. **Data Storage**: Uses Cloudflare R2 for data storage instead of Git-based approach. The `update_steps.py` script fetches from Garmin and uploads JSON directly to R2, avoiding Git repo bloat and build triggers.

2. **Frontend Module System**: ES6 modules in `/scripts/` directory:
   - `main.js` - Entry point, orchestrates initialization
   - `dataLoader.js` - Fetches and processes step data from R2
   - `heatmap.js` - Cal-Heatmap integration and configuration
   - `stats.js` - Statistics calculations (streaks, averages, monthly totals)
   - `tooltips.js` - Custom tooltip system for cells and month labels
   - `popover.js` - Desktop stat detail popovers
   - `bottomSheet.js` - Mobile stat detail bottom sheets  
   - `utils.js` - Shared utilities including `renderStatsCard` for consistent tooltip HTML

3. **Responsive Design Strategy**: 
   - Mobile: Bottom sheets for detailed stats, 2x2 grid layout
   - Desktop: Hover popovers for detailed stats, horizontal layout
   - Automatic switching based on screen size and touch capability

4. **Configuration**: `config.js` sets timezone and R2 data URL. The app is hardcoded for 2026 data.

## Common Development Commands

```bash
# Install dependencies
uv sync

# Run data sync (uploads to R2) 
python update_steps.py

# Run frontend tests
npm test
npm run test:watch
npm run test:coverage

# Run Python tests  
uv run pytest
uv sync --extra test  # Install test dependencies

# Serve locally for development
python3 -m http.server 3000
```

## Data Flow

1. **Data Collection**: `update_steps.py` authenticates with Garmin, fetches daily step data, and uploads to R2 as `steps_data.json`
2. **Frontend Loading**: `dataLoader.js` fetches from R2 URL (configured in `config.js`) 
3. **Processing**: Raw step data is processed into chart format with KM calculations
4. **Visualization**: Cal-Heatmap renders the heatmap with custom cell colors and interactions
5. **Interactivity**: Custom tooltip system shows detailed stats for days/months

## Critical Implementation Details

**Tooltip Grid Layout**: The `renderStatsCard` function in `utils.js` must generate HTML with proper 3-column grid structure (icon, label, value) to match the CSS grid expectations in `main.css`. Incorrect HTML structure causes text overlap.

**Responsive Behavior**: The app automatically detects device capabilities using `shouldUseDesktopPopover()` and switches between popover and bottom sheet interfaces.

**Timezone Handling**: All date processing respects the configured timezone (`Australia/Sydney` by default) using dayjs with timezone plugins.

**R2 Integration**: The app can work with or without R2. If R2 is not configured, it gracefully falls back. The data format includes both `data` (daily steps) and `metadata` (last updated timestamps).

## Environment Setup

Required for data collection:
- `GARMIN_EMAIL` and `GARMIN_PASSWORD` for Garmin Connect API
- `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` for Cloudflare R2
- Optional: `HEALTHCHECKS_URL` for monitoring, `R2_PUBLIC_URL` for custom domain

## Testing Strategy

- **Frontend**: Vitest with happy-dom environment for browser APIs
- **Python**: pytest for data processing and R2 integration
- **Coverage**: Configured for JavaScript modules in `/scripts/` directory
- **Testing Philosophy**: Avoid mocks where possible, mocks lie
- Manual testing via local HTTP server for UI/UX validation