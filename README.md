# Step Tracker

A step tracking application that displays Garmin Connect data as a GitHub-style heatmap.

Live: https://steps.467542981.xyz/

## Quick Start

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Garmin credentials
3. **Set up Cloudflare R2** following [R2_SETUP.md](./R2_SETUP.md) (recommended)
4. **Choose your update method:**
   - **Option A: Cloudflare Worker** (Recommended) - Fully serverless, zero maintenance
     - See [worker/README.md](./worker/README.md) for deployment
   - **Option B: Local/Raspberry Pi** - Run Python script locally
     - Install dependencies: `uv sync`
     - Run sync: `python update_steps.py`
   - **Option C: GitHub Actions** - Run in GitHub's cloud on a schedule
     - Set up repository secrets and workflow (see below)
5. Open `index.html` in your browser

> 💡 **New**: This project now supports **Cloudflare Workers** for automated updates! No more Raspberry Pi needed - deploy once and forget. See [worker/README.md](./worker/README.md) for details.

## Update Methods Comparison

| Method | Setup | Cost | Maintenance | Best For |
|--------|-------|------|-------------|----------|
| **Cloudflare Worker** | 15 min | Free | None | Most users |
| **GitHub Actions** | 10 min | Free | None | GitHub-centric workflows |
| **Raspberry Pi** | 30 min | ~$5/mo | Medium | Local control enthusiasts |
| **Manual** | 0 min | Free | Run manually | Testing/development |

See [worker/README.md](./worker/README.md) for Cloudflare Worker setup (recommended).

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