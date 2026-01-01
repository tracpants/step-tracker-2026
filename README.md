# Step Tracker 2026

A step tracking application that fetches data from Garmin Connect and displays it as a GitHub-style heatmap.

## Local Testing

To test the web interface locally:

```bash
# Start a local HTTP server
python -m http.server 8000

# Open in your browser
open http://localhost:8000
```

The page displays:
- Total step count
- Current streak (days with >10k steps)
- Interactive heatmap of daily step data
- Weekly step totals on hover

## Usage

1. Set up your Garmin credentials in `.env`:
   ```
   GARMIN_EMAIL=your_email@example.com
   GARMIN_PASSWORD=your_password
   ```

2. Run the data update script:
   ```bash
   python update_steps.py
   ```

3. View the results locally using the testing instructions above.