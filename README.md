# Step Tracker

A step tracking application that displays Garmin Connect data as a GitHub-style heatmap.

Live: https://steps.467542981.xyz/

## Quick Start

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Garmin credentials  
3. **Set up Cloudflare R2** following [R2_SETUP.md](./R2_SETUP.md) (recommended)
4. Install dependencies: `uv sync`
5. Run your first sync: `python update_steps.py`
6. Open `index.html` in your browser

> 💡 **New**: This project now supports **Cloudflare R2** for data storage! See [README_R2.md](./README_R2.md) for the improved architecture details.

## Development

```bash
# Run tests
uv run pytest

# Install test dependencies
uv sync --extra test
```

## Analytics

This site uses [GoatCounter](https://www.goatcounter.com) for privacy-friendly analytics.

### Development Testing
- Local development (localhost, 127.0.0.1, private IPs) automatically skips tracking
- To manually disable tracking on any environment, add `#toggle-goatcounter` to the URL
- Example: `https://steps.467542981.xyz/#toggle-goatcounter`