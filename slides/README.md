# AI Hands-On Lab — Slidev Presentation

A hands-on lab for engineers to learn AI concepts and leverage the technology for problem solving and code generation.

## Topics Covered

- ML Foundations (Bias-Variance, Neural Networks, Transformers)
- Large Language Models & Prompting
- Retrieval-Augmented Generation (RAG)
- Agentic AI & Multi-Agent Systems
- Model Context Protocol (MCP)
- AI-Augmented Development Workflows
- Structured Outputs

## Quick Start

```bash
npm install
npm run dev
```

The presentation will open at `http://localhost:3030`.

## Interactive Tours

This presentation includes guided joyride tours (via `vue3-tour`) on key lab slides. Click the "Start Guided Tour" button on lab slides to get step-by-step guidance.

## Lab Exercises

| Lab | Description |
|-----|-------------|
| Lab 1 | Build an MCP Server (file search tool) |
| Lab 2 | RAG Pipeline with Local LLM (Ollama) |
| Lab 3 | Multi-Agent Code Review System (CrewAI) |
| Lab 4 | AI for AWS Infrastructure — SRE context (Terraform, CloudWatch MCP, runbooks) |
| Lab 5 | AI for Managed Service Providers — MSP context (NinjaRMM MCP, ticket triage, SOP RAG) |

## Export to PDF

```bash
npm run export
```

## Built With

- [Slidev](https://sli.dev/) — presentation framework for developers
- [vue3-tour](https://www.npmjs.com/package/vue3-tour) — guided tours
