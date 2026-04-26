---
summary: "Use Azure AI Foundry (Microsoft Foundry) models with OpenClaw"
read_when:
  - You want to use Azure OpenAI models through Azure AI Foundry
  - You need Entra ID or API key auth for Azure OpenAI
  - You want to connect OpenClaw to your Azure AI deployments
title: "Microsoft Foundry"
---

OpenClaw can use **Azure AI Foundry** (formerly Azure OpenAI Service) models
via the bundled `microsoft-foundry` provider. It supports both **Entra ID**
(`az login`) and **API key** authentication, with automatic deployment
discovery from your Azure subscription.

| Property    | Value                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| Provider    | `microsoft-foundry`                                                     |
| Default API | `openai-completions` (auto-selects `openai-responses` for GPT-5 models) |
| Auth        | Entra ID (`az login`) or Azure OpenAI API key                           |
| Env vars    | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`                         |
| Plugin      | Bundled, enabled by default                                             |

## Getting started

<Steps>
  <Step title="Choose an authentication method">
    During `openclaw onboard` or `openclaw provider add`, select
    **Microsoft Foundry** from the provider list. You will be offered two
    authentication options:

    - **Entra ID (`az login`)** — uses your Azure CLI login. No API key
      needed. Tokens refresh automatically as long as your `az` session is
      active.
    - **API key** — uses an Azure OpenAI API key directly. Get it from
      **Resource Management → Keys and Endpoint** in the Azure portal.

  </Step>

  <Step title="Entra ID setup (recommended)">
    Requires the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli):

    ```bash
    az login
    ```

    OpenClaw discovers your subscriptions, lists Azure AI / OpenAI resources,
    and lets you pick a deployment interactively. The selected endpoint and
    deployment are saved to your auth profile.

  </Step>

  <Step title="API key setup">
    Set the environment variable or enter the key when prompted:

    ```bash
    export AZURE_OPENAI_API_KEY="your-azure-openai-key"
    export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
    ```

    You will be prompted for the endpoint URL and deployment name if not
    already configured.

  </Step>

  <Step title="Verify the connection">
    OpenClaw tests the connection during onboarding. You can also verify
    manually:

    ```bash
    openclaw model list
    ```

    Your Microsoft Foundry models appear with the `microsoft-foundry/` prefix
    (e.g. `microsoft-foundry/gpt-4o`).

  </Step>
</Steps>

## Supported models

The provider works with any model deployed to your Azure AI Foundry resource,
including:

- **GPT-4o, GPT-4o mini, GPT-4.1** — Chat completions API
- **GPT-5** — Automatically uses the Responses API (`openai-responses`)
- **Claude models via Azure** — When deployed through Azure AI Foundry,
  the provider auto-detects Anthropic models and applies compatible settings
- **o-series reasoning models** — o1, o3, o4-mini, etc.

The API format (`openai-completions` or `openai-responses`) is resolved
automatically based on the deployment name and underlying model.

## Configuration

After onboarding, the provider config is stored in `openclaw.json`:

```json
{
  "models": {
    "providers": {
      "microsoft-foundry": {
        "baseUrl": "https://your-resource.openai.azure.com",
        "models": [
          {
            "id": "gpt-4o",
            "name": "gpt-4o",
            "api": "openai-completions"
          }
        ]
      }
    }
  }
}
```

## Multiple deployments

To add more deployments from the same or different Azure resources, run
the provider setup again:

```bash
openclaw provider add
```

Select **Microsoft Foundry** and choose a different resource or deployment.
Each deployment is added as a separate model entry.

## Differences from the OpenAI provider

The bundled `openai` provider also supports Azure OpenAI endpoints via
`baseUrl` (see [OpenAI provider — Azure endpoints](/providers/openai#azure-openai-endpoints)).
Use that path for image generation or when you only need a single Azure
endpoint without deployment discovery.

Use `microsoft-foundry` when:

- You want interactive deployment discovery from your subscription
- You use Entra ID authentication (no API key management)
- You have multiple Azure AI resources or deployments
- You deploy non-OpenAI models (e.g. Claude) through Azure AI Foundry

## Related

- [OpenAI provider — Azure endpoints](/providers/openai#azure-openai-endpoints)
- [Azure Speech](/providers/azure-speech)
- [Provider configuration](/providers/models)
