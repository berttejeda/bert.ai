# Installation Guide for Llm-Engineer-2 Panel Plugin

## Prerequisites

- Grafana 10.4.0 or higher
- Gemini API key from Google AI Studio (https://makersuite.google.com/app/apikey)

## Installation Steps

### Method 1: Manual Installation (Development/Testing)

1. **Download the plugin archive**
   ```bash
   # You should have: open-llmengineer2-panel-1.0.1.tar.gz
   ```

2. **Extract to Grafana plugins directory**
   ```bash
   # Find your Grafana plugins directory
   # Common locations:
   # - Linux: /var/lib/grafana/plugins/
   # - Docker: /var/lib/grafana/plugins/ (mounted volume)
   # - macOS: /usr/local/var/lib/grafana/plugins/

   # Create the plugin directory
   sudo mkdir -p /var/lib/grafana/plugins/open-llmengineer2-panel

   # Extract the archive
   sudo tar -xzf open-llmengineer2-panel-1.0.1.tar.gz -C /var/lib/grafana/plugins/open-llmengineer2-panel/
   ```

3. **Allow unsigned plugin**

   Edit your Grafana configuration file (`grafana.ini` or `custom.ini`):
   ```ini
   [plugins]
   allow_loading_unsigned_plugins = open-llmengineer2-panel
   ```

   Or set environment variable:
   ```bash
   GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=open-llmengineer2-panel
   ```

4. **Configure API Key (REQUIRED)**

   The plugin requires the `GEMINI_API_KEY` environment variable to be set.

   **Quick Setup (Systemd - Recommended):**
   ```bash
   # Run the setup script
   ./setup-gemini-key.sh
   ```

   **Manual Setup:**
   ```bash
   # Create systemd override directory
   sudo mkdir -p /etc/systemd/system/grafana-server.service.d

   # Create environment configuration
   sudo tee /etc/systemd/system/grafana-server.service.d/gemini.conf << 'EOF'
   [Service]
   Environment="GEMINI_API_KEY=your_actual_api_key_here"
   EOF

   # Reload and restart
   sudo systemctl daemon-reload
   sudo systemctl restart grafana-server
   ```

   See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for detailed instructions and other methods.

5. **Restart Grafana**
   ```bash
   # Systemd
   sudo systemctl restart grafana-server

   # Docker
   docker restart <container-name>

   # macOS (Homebrew)
   brew services restart grafana
   ```

### Method 2: Docker Installation

1. **Mount plugin directory**

   Add to your `docker-compose.yml`:
   ```yaml
   services:
     grafana:
       image: grafana/grafana:latest
       environment:
         - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=open-llmengineer2-panel
       volumes:
         - ./open-llmengineer2-panel:/var/lib/grafana/plugins/open-llmengineer2-panel
   ```

2. **Extract plugin files**
   ```bash
   mkdir -p open-llmengineer2-panel
   tar -xzf open-llmengineer2-panel-1.0.1.tar.gz -C open-llmengineer2-panel/
   ```

3. **Start container**
   ```bash
   docker-compose up -d
   ```

## Usage

1. **Add the panel to a dashboard**
   - Create or edit a dashboard
   - Add a new panel
   - Select "Llm-Engineer-2" as the visualization type

2. **Analyze your dashboard**
   - Click the "Analyze Dashboard" button
   - The plugin will capture a screenshot of the entire dashboard
   - Gemini AI will analyze the metrics and provide insights
   - Results appear in green text below the button

## Troubleshooting

### Plugin not loading
- Check Grafana logs: `tail -f /var/log/grafana/grafana.log`
- Verify the plugin directory has correct permissions
- Ensure `allow_loading_unsigned_plugins` is configured correctly

### Backend errors
- Check that the correct backend binary exists for your platform
- Verify the binary has execute permissions: `chmod +x gpx_open-llmengineer2-panel_*`
- Check Grafana backend logs for error messages

### API errors
- Verify your Gemini API key is valid
- Check API quota limits at https://makersuite.google.com/
- Ensure you're using a model that supports multimodal input (currently: `gemini-2.0-flash-exp`)

## Platform Support

The plugin includes pre-built binaries for:
- Linux AMD64
- Linux ARM
- Linux ARM64
- macOS AMD64 (Intel)
- macOS ARM64 (M1/M2)
- Windows AMD64

## Security Notes

**IMPORTANT**: The current version has the API key hardcoded in the backend. For production use, you should:

1. Remove the hardcoded API key
2. Use environment variables or Grafana's secure settings
3. Consider implementing proper authentication and authorization

## Getting Your Gemini API Key

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and use it in the plugin configuration

## Support

For issues, feature requests, or contributions:
- Report issues in your project repository
- Check Grafana logs for debugging information
