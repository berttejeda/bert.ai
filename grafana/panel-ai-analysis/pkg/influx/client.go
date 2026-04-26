package influx

import (
	"context"
	"fmt"
	"os"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
)

// Config holds InfluxDB connection parameters.
type Config struct {
	URL    string `json:"url"`
	Token  string `json:"token"`
	Org    string `json:"org"`
	Bucket string `json:"bucket"`
}

// Client wraps an InfluxDB v2 client for executing Flux queries.
type Client struct {
	client   influxdb2.Client
	queryAPI api.QueryAPI
	org      string
	bucket   string
}

// ConfigFromEnv returns an InfluxDB Config populated from environment variables.
func ConfigFromEnv() Config {
	return Config{
		URL:    os.Getenv("INFLUXDB_HOST"),
		Token:  os.Getenv("INFLUXDB_TOKEN"),
		Org:    os.Getenv("INFLUXDB_ORG"),
		Bucket: os.Getenv("INFLUXDB_BUCKET"),
	}
}

// MergeWithEnv fills in any blank fields in cfg from environment variables.
func MergeWithEnv(cfg Config) Config {
	env := ConfigFromEnv()
	if cfg.URL == "" {
		cfg.URL = env.URL
	}
	if cfg.Token == "" {
		cfg.Token = env.Token
	}
	if cfg.Org == "" {
		cfg.Org = env.Org
	}
	if cfg.Bucket == "" {
		cfg.Bucket = env.Bucket
	}
	return cfg
}

// IsConfigured returns true if the minimum required fields are set.
func (c Config) IsConfigured() bool {
	return c.URL != "" && c.Token != "" && c.Org != "" && c.Bucket != ""
}

// New creates a new InfluxDB Client from the given config.
func New(cfg Config) (*Client, error) {
	if cfg.URL == "" {
		return nil, fmt.Errorf("influxdb URL is required")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("influxdb token is required")
	}
	if cfg.Org == "" {
		return nil, fmt.Errorf("influxdb org is required")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("influxdb bucket is required")
	}

	client := influxdb2.NewClient(cfg.URL, cfg.Token)
	queryAPI := client.QueryAPI(cfg.Org)

	return &Client{
		client:   client,
		queryAPI: queryAPI,
		org:      cfg.Org,
		bucket:   cfg.Bucket,
	}, nil
}

// Bucket returns the configured bucket name.
func (c *Client) Bucket() string {
	return c.bucket
}

// Execute runs a Flux query and returns the results as a slice of row maps.
func (c *Client) Execute(ctx context.Context, flux string) ([]map[string]interface{}, error) {
	result, err := c.queryAPI.Query(ctx, flux)
	if err != nil {
		return nil, fmt.Errorf("flux query failed: %w", err)
	}
	defer result.Close()

	var rows []map[string]interface{}
	for result.Next() {
		record := result.Record()
		row := make(map[string]interface{})
		for k, v := range record.Values() {
			row[k] = v
		}
		rows = append(rows, row)
	}

	if err := result.Err(); err != nil {
		return nil, fmt.Errorf("flux query iteration error: %w", err)
	}

	return rows, nil
}

// Close releases InfluxDB client resources.
func (c *Client) Close() {
	c.client.Close()
}
