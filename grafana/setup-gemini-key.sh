#!/bin/bash
# Setup Gemini API Key for Grafana Plugin

echo "=== Gemini API Key Setup for Grafana Plugin ==="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "Please do not run this script as root. It will use sudo when needed."
  exit 1
fi

# Prompt for API key
echo "Enter your Gemini API Key"
echo "(Get it from: https://makersuite.google.com/app/apikey)"
echo ""
read -sp "API Key: " API_KEY
echo ""
echo ""

if [ -z "$API_KEY" ]; then
  echo "❌ Error: API key cannot be empty"
  exit 1
fi

# Create systemd override directory
echo "Creating systemd override configuration..."
sudo mkdir -p /etc/systemd/system/grafana-server.service.d

# Create override file with API key
sudo tee /etc/systemd/system/grafana-server.service.d/gemini.conf > /dev/null << EOF
[Service]
Environment="GEMINI_API_KEY=${API_KEY}"
EOF

echo "✓ Configuration file created"
echo ""

# Set proper permissions
sudo chmod 600 /etc/systemd/system/grafana-server.service.d/gemini.conf
echo "✓ Permissions set (secure)"
echo ""

# Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload
echo "✓ Systemd reloaded"
echo ""

# Restart Grafana
echo "Restarting Grafana..."
sudo systemctl restart grafana-server

# Wait a moment for restart
sleep 2

# Check status
if sudo systemctl is-active --quiet grafana-server; then
  echo "✓ Grafana restarted successfully"
else
  echo "❌ Warning: Grafana may not have started correctly"
  echo "   Check status: sudo systemctl status grafana-server"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Verify the environment variable is set:"
echo "  sudo systemctl show grafana-server | grep GEMINI_API_KEY"
echo ""
echo "Check Grafana logs:"
echo "  sudo journalctl -u grafana-server -f"
echo ""
echo "Your API key is now configured and stored securely in:"
echo "  /etc/systemd/system/grafana-server.service.d/gemini.conf"
echo ""
