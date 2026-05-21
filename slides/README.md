# AI Hands-On Lab — Slidev Presentation

A hands-on lab for engineers to learn AI concepts and leverage the technology to reduce startup cost for problem solving and code generation.

## Slide Deck Structure

| Part | Title | Slides |
|------|-------|--------|
| 1 | **AI Foundations** — ML basics, neural networks, Transformers, LLMs, prompting | 4 |
| 2 | **Retrieval-Augmented Generation (RAG)** — pipeline, embeddings, vector DBs, hands-on code | 2 |
| 3 | **Agentic AI** — agent anatomy, MCP servers, multi-agent systems, A2A/AGNTCY | 3 |
| 4 | **Reducing Startup Cost** — AI-assisted problem solving, prompt engineering, dev workflow | 3 |
| 5 | **Hands-On Labs** — context-specific labs with guided tours | 8 |
| 6 | **The AI-Augmented Engineer's Toolkit** — daily stack, recap, next steps | 3 |

## Topics Covered

- ML Foundations (Bias-Variance, Neural Networks, Transformers)
- Large Language Models & Prompting
- Retrieval-Augmented Generation (RAG)
- Agentic AI & Multi-Agent Systems
- Model Context Protocol (MCP)
- AI-Augmented Development Workflows
- Local AI Agents (OpenClaw, Hermes Agent)
- GPU/Hardware Requirements for Local Inference

## Quick Start

```bash
npm install
npm run dev
```

The presentation will open at `http://localhost:3030`.

## Interactive Tours

This presentation includes guided joyride tours (via `vue3-tour`) on key lab slides. Click the **Start Guided Tour** button on lab slides to get step-by-step guidance.

## Lab Exercises

| Lab | Context | Description |
|-----|---------|-------------|
| Lab 1 | General | Build an MCP Server — file search tool with the MCP Python SDK |
| Lab 2 | General | RAG Pipeline with Local LLM — Ollama + Chroma + LangChain |
| Lab 3 | General | Multi-Agent Code Review System — CrewAI with security, performance, and quality agents |
| Lab 4 | SRE / AWS | AI for AWS Infrastructure — Terraform generation, CloudWatch MCP server, AI-generated runbooks |
| Lab 5 | MSP | AI for Managed Service Providers — NinjaRMM MCP server, ticket triage pipeline, RAG over SOPs |
| Lab 6a | Local AI | Overview & Hardware — GPU requirements table, architecture diagram, prerequisites checklist |
| Lab 6b | Local AI | Deploy OpenClaw — Docker Compose setup, multi-channel config, channel plugins, verification |
| Lab 6c | Local AI | Deploy Hermes Agent — install, Ollama config, tool setup (including MCP), autonomous task examples |

## Local Inference Setup

The `llama.cpp/` directory in this repo contains cross-platform scripts for running a local llama.cpp inference server:

```bash
# macOS / Linux
./llama.cpp/init.sh

# Windows (PowerShell)
.\llama.cpp\init.ps1
```

See [`llama.cpp/README.md`](../llama.cpp/README.md) for full documentation on environment variables, GPU configuration, and multi-model presets.

## Export to PDF

```bash
npm run export
```

## Built With

- [Slidev](https://sli.dev/) — presentation framework for developers
- [vue3-tour](https://www.npmjs.com/package/vue3-tour) — guided tours
- [Ollama](https://ollama.com/) — local LLM runtime (used in Labs 2, 6b, 6c)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — local inference server alternative
- [OpenClaw](https://github.com/openclaw/openclaw) — open-source personal AI assistant
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — autonomous AI agent by Nous Research
