//go:build mage

package main

import (
	// mage:import
	"github.com/grafana/grafana-plugin-sdk-go/build"
)

// Default configures the default target to build the plugin.
func Default() {
	build.BuildAll()
}
