package influx

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// SchemaCache caches the InfluxDB schema description with a configurable TTL.
type SchemaCache struct {
	mu          sync.RWMutex
	description string
	fetchedAt   time.Time
	ttl         time.Duration
}

// NewSchemaCache creates a new schema cache with the given TTL.
func NewSchemaCache(ttl time.Duration) *SchemaCache {
	return &SchemaCache{ttl: ttl}
}

// Get returns the cached schema if still valid, or fetches a fresh one.
func (sc *SchemaCache) Get(ctx context.Context, c *Client) (string, error) {
	sc.mu.RLock()
	if sc.description != "" && time.Since(sc.fetchedAt) < sc.ttl {
		defer sc.mu.RUnlock()
		return sc.description, nil
	}
	sc.mu.RUnlock()

	sc.mu.Lock()
	defer sc.mu.Unlock()

	// Double-check after acquiring write lock
	if sc.description != "" && time.Since(sc.fetchedAt) < sc.ttl {
		return sc.description, nil
	}

	desc, err := discoverSchema(ctx, c)
	if err != nil {
		// If we have a stale cache, return it rather than failing
		if sc.description != "" {
			return sc.description, nil
		}
		return "", err
	}

	sc.description = desc
	sc.fetchedAt = time.Now()
	return desc, nil
}

// Invalidate forces the next Get to re-fetch.
func (sc *SchemaCache) Invalidate() {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.description = ""
	sc.fetchedAt = time.Time{}
}

// discoverSchema introspects the InfluxDB bucket for measurements, tags, and fields.
func discoverSchema(ctx context.Context, c *Client) (string, error) {
	var sb strings.Builder

	// Discover measurements
	measurements, err := queryStringColumn(ctx, c, fmt.Sprintf(
		`import "influxdata/influxdb/schema"
schema.measurements(bucket: "%s")`, c.bucket))
	if err != nil {
		return "", fmt.Errorf("failed to discover measurements: %w", err)
	}

	for _, m := range measurements {
		sb.WriteString(fmt.Sprintf("## Measurement: %s\n", m))

		// Tag keys
		tags, err := queryStringColumn(ctx, c, fmt.Sprintf(
			`import "influxdata/influxdb/schema"
schema.measurementTagKeys(bucket: "%s", measurement: "%s")`, c.bucket, m))
		if err == nil && len(tags) > 0 {
			// Filter out internal tags
			var filtered []string
			for _, t := range tags {
				if !strings.HasPrefix(t, "_") {
					filtered = append(filtered, t)
				}
			}
			if len(filtered) > 0 {
				sb.WriteString(fmt.Sprintf("  Tags: %s\n", strings.Join(filtered, ", ")))
			}
		}

		// Field keys
		fields, err := queryStringColumn(ctx, c, fmt.Sprintf(
			`import "influxdata/influxdb/schema"
schema.measurementFieldKeys(bucket: "%s", measurement: "%s")`, c.bucket, m))
		if err == nil && len(fields) > 0 {
			sb.WriteString(fmt.Sprintf("  Fields: %s\n", strings.Join(fields, ", ")))
		}

		sb.WriteString("\n")
	}

	if sb.Len() == 0 {
		return "", fmt.Errorf("no schema information discovered in bucket %q", c.bucket)
	}

	return sb.String(), nil
}

// queryStringColumn executes a Flux query and returns the _value column as strings.
func queryStringColumn(ctx context.Context, c *Client, flux string) ([]string, error) {
	result, err := c.queryAPI.Query(ctx, flux)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	var values []string
	for result.Next() {
		v := result.Record().Value()
		if v != nil {
			values = append(values, fmt.Sprintf("%v", v))
		}
	}

	if err := result.Err(); err != nil {
		return nil, err
	}

	return values, nil
}
