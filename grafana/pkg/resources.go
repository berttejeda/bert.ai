package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

// ScreenshotRequestBody defines the structure for the incoming screenshot payload.
type ScreenshotRequestBody struct {
	ImageData string `json:"imageData"`
}

// CallResource is the entry point for all resource calls.
// func (a *App) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
// 	// Use a switch to handle different resource paths.
// 	switch req.Path {
// 	case "screenshot":
// 		return a.handleScreenshot(ctx, req, sender)
// 	default:
// 		return sender.Send(&backend.CallResourceResponse{
// 			Status: http.StatusNotFound,
// 		})
// 	}
// }

// handleScreenshot receives the screenshot data from the frontend.
func (a *App) handleScreenshot(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {

	if a.geminiClient == nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte("Gemini client not initialized. Please configure the API key."),
		})
	}

	var body ScreenshotRequestBody
	if err := json.Unmarshal(req.Body, &body); err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusBadRequest,
			Body:   []byte(err.Error()),
		})
	}

	dataParts := strings.Split(body.ImageData, ",")
	if len(dataParts) != 2 {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusBadRequest,
			Body:   []byte("Invalid image data format"),
		})
	}

	// Decode base64 image data
	imageBytes, err := base64.StdEncoding.DecodeString(dataParts[1])
	if err != nil {
		log.DefaultLogger.Error("Failed to decode base64 image", "err", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusBadRequest,
			Body:   []byte("Failed to decode base64 image: " + err.Error()),
		})
	}

	prompt := []genai.Part{
		genai.ImageData("png", imageBytes),
		genai.Text("Analyze this Grafana dashboard. Describe what metrics and data are being displayed, identify any trends or anomalies, and provide insights about what the dashboard reveals."),
	}

	resp, err := a.geminiClient.GenerateContent(ctx, prompt...)
	if err != nil {
		log.DefaultLogger.Error("Gemini content generation failed", "err", err)
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte("Failed to generate content from Gemini: " + err.Error()),
		})
	}

	// Extract text from response
	var analysisText string
	for _, cand := range resp.Candidates {
		if cand.Content != nil {
			for _, part := range cand.Content.Parts {
				if txt, ok := part.(genai.Text); ok {
					analysisText += string(txt)
				}
			}
		}
	}

	responseBody := map[string]string{
		"analysis": analysisText,
	}
	jsonBody, err := json.Marshal(responseBody)
	if err != nil {
		return err
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: http.StatusOK,
		Body:   jsonBody,
	})
}
