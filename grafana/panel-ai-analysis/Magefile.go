//go:build mage

package main

import (
	"encoding/json"
	"fmt"
	"os"

	// mage:import
	"github.com/grafana/grafana-plugin-sdk-go/build"
)

// Default configures the default target to build the plugin.
func Default() {
	if err := build.SetBeforeBuildCallback(beforeBuild); err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not set build callback: %v\n", err)
	}
	build.BuildAll()
}

// beforeBuild injects the version from package.json into the binary via ldflags.
func beforeBuild(cfg build.Config) (build.Config, error) {
	version, err := readPackageVersion()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not read version from package.json: %v\n", err)
		return cfg, nil
	}

	cfg.CustomVars = map[string]string{
		"main.Version": version,
	}
	fmt.Printf("Building with version: %s\n", version)
	return cfg, nil
}

// readPackageVersion reads the "version" field from package.json.
func readPackageVersion() (string, error) {
	data, err := os.ReadFile("package.json")
	if err != nil {
		return "", err
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return "", err
	}
	if pkg.Version == "" {
		return "", fmt.Errorf("version field is empty")
	}
	return pkg.Version, nil
}
