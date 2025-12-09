# Rea Platform Components

This page documents the Rea-specific components that integrate with MCP.

## Consulting Pods

**Consulting Pods** are multi-agent workflows that orchestrate multiple specialized AI agents to accomplish complex tasks. Each pod defines:

- A set of specialized agents with specific roles
- Workflow logic for agent collaboration
- Input/output specifications
- Configuration options

### Pod Structure

```php
class ConsultingPod
{
    public string $id;
    public string $name;
    public string $description;
    public array $agents;         // Specialized agents in the pod
    public array $config;         // Pod configuration
    public string $category;      // e.g., "research", "analysis", "creative"

    public function execute(array $inputs): PodResult;
    public function executeAsync(array $inputs): string; // Returns job ID
}
```

### Example Pods

| Pod Name | Agents | Purpose |
|----------|--------|---------|
| **Research Pod** | Researcher, Fact-Checker, Summarizer | Deep research on topics |
| **Analysis Pod** | Data Analyst, Visualizer, Interpreter | Analyze data and generate insights |
| **Content Pod** | Writer, Editor, SEO Specialist | Create and optimize content |
| **Code Review Pod** | Reviewer, Security Analyst, Performance Expert | Comprehensive code reviews |

### MCP Integration

Consulting Pods are exposed via MCP as:

**Tools:**

- `rea_create_pod` - Create a new consulting pod
- `rea_run_pod` - Execute a pod with inputs
- `rea_list_pods` - List available pods

**Resources:**

- `rea://pods` - List all pods
- `rea://pods/{id}` - Get pod details and recent executions

**Prompts:**

- `rea_pod_builder` - Interactive prompt for designing new pods

---

## Command Room

The **Command Room** is Rea's activity capture and analysis system. It collects user activity data from the Chrome extension and provides:

- **Activity Logging**: Records user actions across web applications
- **Pattern Detection**: Identifies repetitive tasks and workflows
- **Automation Suggestions**: Recommends automations based on patterns
- **Context Awareness**: Provides relevant context for AI agent decisions

### Activity Structure

```php
class CommandRoomActivity
{
    public string $id;
    public string $userId;
    public string $app;           // Application name (e.g., "gmail", "notion")
    public string $action;        // Action type (e.g., "click", "type", "navigate")
    public array $metadata;       // Action-specific data
    public Carbon $timestamp;
    public ?string $sessionId;    // Group related activities
}
```

### Data Flow

```
┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐
│   Chrome     │───►│   Command Room   │───►│   Pattern         │
│  Extension   │    │   Service        │    │   Analyzer        │
└──────────────┘    └────────┬─────────┘    └─────────┬─────────┘
                             │                        │
                             ▼                        ▼
                    ┌────────────────┐       ┌───────────────────┐
                    │   Activity     │       │   Automation      │
                    │   Database     │       │   Suggestions     │
                    └────────────────┘       └───────────────────┘
```

### MCP Integration

Command Room is exposed via MCP as:

**Tools:**

- `rea_search_command_room` - Search activities by query, date range, app

**Resources:**

- `rea://command-room/recent` - Recent activity feed
- `rea://command-room/patterns` - Detected patterns

**Prompts:**

- `rea_automation_analysis` - Analyze activities and suggest automations

---

## n8n Workflow Integration

Rea integrates with **n8n** for cross-application workflow automation. MCP extends this by:

- Allowing AI agents to trigger n8n workflows
- Exposing workflow status and results
- Enabling workflow discovery and parameter inspection

### MCP Integration

**Tools:**

- `rea_trigger_workflow` - Trigger an n8n workflow with parameters
- `rea_get_workflow_status` - Check execution status

**Resources:**

- `rea://workflows` - List available workflows
- `rea://workflows/{id}` - Workflow details and execution history

---

## LLaMA Agent Engine

Rea uses **LLaMA** (Large Language Model Meta AI) as its primary language model, enhanced with:

### Reflection Prompt Framework

A 5-step reasoning framework that improves accuracy:

1. **Understand** - Restate the user's request
2. **Plan** - Outline steps to fulfill the request
3. **Execute** - Carry out the plan (including tool calls)
4. **Verify** - Check the response addresses the request
5. **Reflect** - Consider if there's a better approach

### Tool Integration

LLaMA's tool calling is mapped to MCP:

```php
// MCP tool definition format
$mcpTool = [
    'name' => 'notion.search',
    'description' => 'Search Notion pages',
    'inputSchema' => [
        'type' => 'object',
        'properties' => [
            'query' => ['type' => 'string']
        ],
        'required' => ['query']
    ]
];

// Converted for LLaMA
$llamaTool = [
    'type' => 'function',
    'function' => [
        'name' => 'notion.search',
        'description' => 'Search Notion pages',
        'parameters' => $mcpTool['inputSchema']
    ]
];
```

---

## Chrome Extension

The **Rea Chrome Extension** captures user activity for the Command Room:

### Captured Data

- Page visits and navigation
- Click actions and form interactions
- Time spent on applications
- Cross-app workflows

### Privacy Controls

- User-configurable capture settings
- Domain whitelist/blacklist
- Data encryption in transit
- Local processing options

### MCP Relevance

The extension provides context that enhances MCP tool usage:

- Recent activity informs tool suggestions
- Patterns help predict user intent
- Cross-app context improves automation recommendations

---

## Next Steps

- [Rea Integration Guide](../implementation/rea-integration.md) - Full implementation details
- [Custom Connectors Tutorial](../tutorials/custom-connectors.md) - Build your own MCP server
- [Security Reference](../reference/security.md) - Security best practices
