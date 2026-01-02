#!/bin/bash

# Step Tracker Raspberry Pi Setup Script
set -e

echo "🚀 Setting up Step Tracker on Raspberry Pi..."

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "This script should not be run as root. Run without sudo."
   exit 1
fi

# Get current user and directory
USER=$(whoami)
CURRENT_DIR=$(pwd)

# Update system
echo "📦 Updating system packages..."
sudo apt update
sudo apt install -y python3-pip git curl

# Install uv (Python package manager)
echo "⚙️  Installing uv package manager..."
if ! command -v uv &> /dev/null; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
fi

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
uv sync

# Create .env template if it doesn't exist
if [[ ! -f .env ]]; then
    echo "📝 Creating .env template..."
    cat > .env << EOF
# Garmin Connect credentials
GARMIN_EMAIL=your_email@example.com
GARMIN_PASSWORD=your_password

# Timezone (optional, defaults to Australia/Sydney)
TIMEZONE=Australia/Sydney
EOF
    echo "⚠️  Please edit .env with your actual Garmin credentials before starting the service"
fi

# Update systemd service with correct user and paths
echo "🔧 Configuring systemd service..."
sudo cp step-tracker.service /etc/systemd/system/
sudo cp step-tracker.timer /etc/systemd/system/

# Replace placeholder paths in service file
sudo sed -i "s|/home/pi|$HOME|g" /etc/systemd/system/step-tracker.service
sudo sed -i "s|User=pi|User=$USER|g" /etc/systemd/system/step-tracker.service
sudo sed -i "s|Group=pi|Group=$USER|g" /etc/systemd/system/step-tracker.service
sudo sed -i "s|/home/pi/step-tracker|$CURRENT_DIR|g" /etc/systemd/system/step-tracker.service

# Reload systemd and enable services
echo "🎯 Enabling systemd timer..."
sudo systemctl daemon-reload
sudo systemctl enable step-tracker.timer
sudo systemctl start step-tracker.timer

# Check status
echo "✅ Setup complete!"
echo
echo "📊 Service Status:"
sudo systemctl status step-tracker.timer --no-pager

echo
echo "🔧 Next steps:"
echo "1. Edit .env file with your Garmin credentials: nano .env"
echo "2. Test the service: sudo systemctl start step-tracker.service"
echo "3. Check logs: sudo journalctl -u step-tracker.service -f"
echo
echo "The service will run automatically daily at 6:00 AM."