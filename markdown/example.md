---
vars:
  myvar: "myvalue"
  ticker: "AAPL"
  ai:
    base_url: "http://localhost:11434"
    model: "llama3.1"
    timeout: 120s
    verify_ssl: true
    # max_stdout_per_block: 2000    # chars of raw stdout kept per prior block
    # max_context_chars: 12000      # total prior context cap    
---

# AI Enabled Markdown Demo

This is a markdown-based AI-enabled document.

The idea is to easily create technical documents that you can
easily maintain and present, and which come with insights that you
can derive from live code blocks that serve as the data for AI prompts.

## Price & Moving Averages - {{ ticker }}

<span class="prompt-code-block">

```bash
# BeginPrompt
# Review the {{ ticker }} price moving averages and make a statement about the price.
# EndPrompt
grafana-query --token {{ token }} --config ~/etc/grafana-query/config.yaml --org 1 -q stocksDashboard.prma -e ticker={{ ticker }}
```

</span>

## Quarterly Revenue Growth (YoY) - {{ ticker }}

<span class="prompt-code-block">

```bash
# BeginPrompt
# Review the Quarterly Revenue Growth (YoY) output below, which includes data for {{ ticker }}.
# Provide a summary of the revenue growth trends.
# EndPrompt
grafana-query --token {{ token }} --config ~/etc/grafana-query/config.yaml --org 1 -q stocksDashboardAll.qrg
```

</span>

## Overall - {{ ticker }}

<span data-scope="global" class="prompt-code-block">

```bash
# BeginPrompt
# Review all of the computed data in the document so far.
# Is the company represented by {{ ticker}} a sound investment based on this data?
# EndPrompt
```

</span>
