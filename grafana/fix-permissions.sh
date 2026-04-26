#!/bin/bash
# Fix Grafana plugin directory permissions

echo "=== Fixing Grafana Plugin Directory Permissions ==="
echo ""

echo "Current ownership:"
ls -ld /var/lib/grafana/plugins/
echo ""

echo "Changing ownership to grafana user..."
sudo chown -R grafana:grafana /var/lib/grafana/plugins/

echo ""
echo "New ownership:"
ls -ld /var/lib/grafana/plugins/
echo ""

echo "Verifying your plugin is still there..."
if [ -f "/var/lib/grafana/plugins/open-llmengineer2-panel/plugin.json" ]; then
  echo "✓ Plugin found at /var/lib/grafana/plugins/open-llmengineer2-panel/"
else
  echo "✗ Plugin not found - may need to reinstall"
fi
echo ""

echo "Restarting Grafana to apply changes..."
sudo systemctl restart grafana-server
echo ""

echo "✓ Done! Grafana should now be able to install other plugins."
echo ""
echo "To verify:"
echo "1. Go to Configuration > Plugins in Grafana"
echo "2. Try installing a plugin from the catalog"
echo ""
