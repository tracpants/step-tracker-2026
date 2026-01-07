# Step Tracker with R2 Storage

This step tracker now uses **Cloudflare R2** for data storage, providing a much simpler and more efficient architecture.

## 🎯 How It Works

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Garmin API    │────│  update_steps.py │────│ Cloudflare R2   │
│                 │    │                 │    │   (Data Store)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │   GitHub Pages  │
                                               │  (Static Site)  │
                                               └─────────────────┘
                                                        │
                                               ┌─────────────────┐
                                               │     Website     │
                                               │   (Your Users)  │
                                               └─────────────────┘
```

## ✅ Benefits

- **Zero Build Triggers**: Data updates bypass GitHub Actions entirely
- **Instant Updates**: Changes appear immediately after Garmin sync
- **Global CDN**: Cloudflare serves your data from edge locations worldwide
- **Simple Architecture**: No complex git branches or workflows
- **Cost Effective**: R2 storage is very affordable for small files
- **Reliable**: Built on Cloudflare's robust infrastructure

## 🚀 Setup

1. **Follow R2 Setup**: See [R2_SETUP.md](./R2_SETUP.md) for detailed instructions
2. **Configure Environment**: Add R2 credentials to your `.env` file
3. **Deploy**: Push changes to trigger GitHub Actions deployment

## 🔄 Workflow

### Data Updates (Every Run)
1. `update_steps.py` fetches steps from Garmin
2. Script uploads `steps_data.json` directly to R2
3. Website immediately serves new data from R2
4. **No git commits, no build triggers**

### Code Updates (When Needed)
1. Push code changes to GitHub
2. GitHub Actions builds static site
3. Deploys to GitHub Pages
4. Website fetches data from R2

## 📁 File Structure

```
├── index.html              # Static website
├── config.js              # Configuration (includes R2 URL)
├── update_steps.py         # Data sync script
├── R2_SETUP.md            # R2 configuration guide
└── .env                   # Environment variables (R2 credentials)
```

## 🛠 Environment Variables

```bash
# Garmin credentials
GARMIN_EMAIL=your_email@example.com
GARMIN_PASSWORD=your_password

# R2 configuration
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=step-tracker

# Optional: Custom domain
R2_PUBLIC_URL=https://data.yourdomain.com
```

## 🔧 Commands

```bash
# Install dependencies
uv sync

# Run step sync (uploads to R2)
python update_steps.py

# Test R2 configuration
python -c "from update_steps import upload_to_r2; print('R2 configured!' if upload_to_r2('test.json', 'test.js') else 'Check R2 config')"
```

## 🆚 Comparison with Git-based Approach

| Feature | Git-based | R2-based |
|---------|-----------|----------|
| Data updates trigger builds | ❌ Yes | ✅ No |
| Update speed | 🐌 ~30s | ⚡ Instant |
| Architecture complexity | 😵 High | 😊 Simple |
| Repository size | 📈 Growing | 📉 Minimal |
| CDN performance | 🌍 GitHub | 🚀 Cloudflare |
| Cost | Free | Nearly free |

## 📊 Migration from Git-based

If you're migrating from the git-based approach:

1. Set up R2 following [R2_SETUP.md](./R2_SETUP.md)
2. Run `update_steps.py` once to upload existing data to R2
3. Data will automatically switch to R2 source
4. Old `gh-pages` branch can be deleted

Your step tracking will continue working seamlessly with much better performance! 🎉