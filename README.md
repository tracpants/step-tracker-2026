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

## Raspberry Pi Setup

To run this automatically on a Raspberry Pi:

### Prerequisites
- Raspberry Pi with Raspberry Pi OS
- Git configured with your credentials
- Internet connection

### Automated Setup
1. Clone this repository to your Pi:
   ```bash
   git clone <your-repo-url> step-tracker
   cd step-tracker
   ```

2. Run the setup script:
   ```bash
   chmod +x setup-pi.sh
   sudo ./setup-pi.sh
   ```

3. Configure your Garmin credentials:
   ```bash
   nano .env
   # Add:
   # GARMIN_EMAIL=your_email@example.com
   # GARMIN_PASSWORD=your_password
   # TIMEZONE=Australia/Sydney
   ```

4. Test the setup:
   ```bash
   sudo systemctl start step-tracker.service
   sudo systemctl status step-tracker.service
   ```

### Manual Setup
If you prefer manual setup:

1. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install -y python3-pip git
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source $HOME/.cargo/env
   ```

2. Install Python dependencies:
   ```bash
   uv sync
   ```

3. Create systemd service files (see step-tracker.service and step-tracker.timer)

4. Enable the service:
   ```bash
   sudo cp step-tracker.service step-tracker.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable step-tracker.timer
   sudo systemctl start step-tracker.timer
   ```

### Service Management
- Check service status: `sudo systemctl status step-tracker.service`
- View logs: `sudo journalctl -u step-tracker.service -f`
- Check timer status: `sudo systemctl status step-tracker.timer`
- Run manually: `sudo systemctl start step-tracker.service`

The service will run daily at 6:00 AM to fetch and update your step data automatically.