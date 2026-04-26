#!/bin/bash
# Setup script for Llm-Engineer-2 Grafana Plugin

echo "=== Llm-Engineer-2 Plugin Setup ==="
echo ""

# Check if running as root for some operations
if [ "$EUID" -ne 0 ]; then
  echo "Note: Some operations may require sudo privileges"
  echo ""
fi

# 1. Check Grafana installation
echo "1. Checking Grafana installation..."
if systemctl is-active --quiet grafana-server; then
  echo "   ✓ Grafana service is running"
else
  echo "   ✗ Grafana service is not running"
  echo "   Run: sudo systemctl start grafana-server"
fi
echo ""

# 2. Check plugin directory
echo "2. Checking plugin installation..."
if [ -f "/var/lib/grafana/plugins/open-llmengineer2-panel/plugin.json" ]; then
  echo "   ✓ Plugin files found in /var/lib/grafana/plugins/open-llmengineer2-panel/"
else
  echo "   ✗ Plugin not found. Installing..."
  echo ""
  echo "   Run these commands:"
  echo "   sudo mkdir -p /var/lib/grafana/plugins/open-llmengineer2-panel"
  echo "   sudo cp -r dist/* /var/lib/grafana/plugins/open-llmengineer2-panel/"
  echo "   sudo chown -R grafana:grafana /var/lib/grafana/plugins/open-llmengineer2-panel"
fi
echo ""

# 3. Check Grafana configuration
echo "3. Checking Grafana configuration..."
if grep -q "allow_loading_unsigned_plugins.*open-llmengineer2-panel" /etc/grafana/grafana.ini 2>/dev/null; then
  echo "   ✓ Unsigned plugin is allowed in grafana.ini"
elif grep -q "GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS" /etc/systemd/system/grafana-server.service.d/*.conf 2>/dev/null; then
  echo "   ✓ Unsigned plugin is allowed via environment variable"
else
  echo "   ✗ Plugin not configured as unsigned"
  echo ""
  echo "   Choose one of these options:"
  echo ""
  echo "   Option A: Edit /etc/grafana/grafana.ini"
  echo "   sudo nano /etc/grafana/grafana.ini"
  echo "   Add under [plugins] section:"
  echo "   allow_loading_unsigned_plugins = open-llmengineer2-panel"
  echo ""
  echo "   Option B: Use environment variable"
  echo "   sudo mkdir -p /etc/systemd/system/grafana-server.service.d"
  echo "   sudo tee /etc/systemd/system/grafana-server.service.d/override.conf << EOF
[Service]
Environment=\"GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=open-llmengineer2-panel\"
EOF"
  echo "   sudo systemctl daemon-reload"
fi
echo ""

# 4. Restart instruction
echo "4. After configuration, restart Grafana:"
echo "   sudo systemctl restart grafana-server"
echo ""

# 5. Verification
echo "5. Verify plugin loaded:"
echo "   - Go to http://localhost:3000"
echo "   - Navigate to Configuration > Plugins"
echo "   - Search for 'Llm-Engineer-2'"
echo "   - Or create a dashboard and add the 'Llm-Engineer-2' panel"
echo ""

echo "=== Setup Complete ==="
echo ""
echo "For more details, see INSTALLATION.md"
