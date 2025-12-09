# Rea MCP Integration Guide

This guide covers integrating MCP support into the Rea platform, leveraging existing architecture including LLaMA agents, Reflection prompts, n8n workflows, and Command Room.

![Rea Integration Architecture](../assets/diagrams/rea-integration.png)

## Overview

Rea.pro is an **agentic framework and orchestration platform** for running automations and consulting pods (multi-agent workflows). MCP integration enables Rea's AI agents to connect with external tools and data sources through a standardized protocol.

!!! info "Existing MCP Work"
    A server/client pair prototype has already been initiated for Rea.pro. This documentation builds on that foundation.

## Architecture Vision

Rea should implement MCP in **two directions**:

1. **MCP Host/Client** - Enable Rea to connect to external MCP servers (Notion, Slack, GitHub)
2. **MCP Server** - Expose Rea's consulting pods, automations, and Command Room to external MCP clients

```
┌─────────────────────────────────────────────────────────────────┐
│                         REA.PRO                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────────┐│
│  │   MCP HOST       │    │          MCP SERVER                 ││
│  │  (Client Pool)   │    │   (Exposes Rea Capabilities)        ││
│  │                  │    │                                     ││
│  │ ┌──────────────┐ │    │  Tools:                            ││
│  │ │Notion Client │ │    │  - rea_create_pod                  ││
│  │ ├──────────────┤ │    │  - rea_run_automation              ││
│  │ │Slack Client  │ │    │  - rea_search_command_room         ││
│  │ ├──────────────┤ │    │  - rea_query_analytics             ││
│  │ │GitHub Client │ │    │                                     ││
│  │ └──────────────┘ │    │  Resources:                         ││
│  └────────┬─────────┘    │  - rea://pods/{podId}               ││
│           │              │  - rea://workflows/{workflowId}     ││
│           ▼              └──────────────┬──────────────────────┘│
│  ┌──────────────────┐                   │                       │
│  │   LLaMA Agent    │◄──────────────────┘                       │
│  │   + Reflection   │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Current Rea Architecture

### Existing Components

| Component | Description | MCP Relevance |
|-----------|-------------|---------------|
| **LLaMA** | Local LLM with custom system prompts | Tool calling integration |
| **Reflection Prompts** | Prompt engineering framework | Enhanced accuracy for tool use |
| **Consulting Pods** | Multi-agent workflows | Expose as MCP tools |
| **Command Room** | Activity capture and automation | Expose as MCP resources |
| **n8n Integration** | Cross-app workflow automation | Complement MCP capabilities |
| **Chrome Extension** | User activity capture | Context for MCP operations |

### Integration Patterns to Leverage

Rea already uses:

- Token-based authentication between components
- n8n for cross-app automation
- Chrome extension for activity capture
- API integration with external services

These patterns align well with MCP's design.

---

## Installation

### Install the PHP MCP SDK

```bash
composer require mcp/sdk
```

For Laravel-specific features:

```bash
composer require php-mcp/laravel
```

---

## Core Implementation

### MCP Host Service

The central service managing all MCP server connections:

```php title="app/Services/MCP/ReaMcpHost.php"
<?php

namespace App\Services\MCP;

use Mcp\Client;
use Mcp\Client\Transport\StdioTransport;
use Mcp\Client\Transport\HttpTransport;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class ReaMcpHost
{
    private array $clients = [];
    private array $serverConfigs;

    public function __construct()
    {
        $this->serverConfigs = config('mcp.servers', []);
    }

    /**
     * Connect to an MCP server.
     */
    public function connect(string $serverName): Client
    {
        if (isset($this->clients[$serverName])) {
            return $this->clients[$serverName];
        }

        $config = $this->serverConfigs[$serverName]
            ?? throw new \InvalidArgumentException("Unknown server: {$serverName}");

        if (!($config['enabled'] ?? true)) {
            throw new \RuntimeException("Server {$serverName} is disabled");
        }

        $transport = $this->createTransport($config);

        $client = new Client(
            info: ['name' => 'rea-pro', 'version' => config('app.version', '1.0.0')],
            capabilities: ['tools' => [], 'resources' => [], 'prompts' => []]
        );

        $client->connect($transport);
        $this->clients[$serverName] = $client;

        Log::info("Connected to MCP server: {$serverName}");

        return $client;
    }

    /**
     * Get all available tools across connected servers.
     */
    public function getAvailableTools(): array
    {
        return Cache::remember('mcp_all_tools', 300, function () {
            $allTools = [];

            foreach (array_keys($this->serverConfigs) as $serverName) {
                try {
                    $client = $this->connect($serverName);
                    $tools = $client->listTools();

                    foreach ($tools as $tool) {
                        $qualifiedName = "{$serverName}.{$tool['name']}";
                        $allTools[$qualifiedName] = array_merge($tool, [
                            'server' => $serverName,
                            'qualifiedName' => $qualifiedName,
                        ]);
                    }
                } catch (\Exception $e) {
                    Log::warning("Failed to get tools from {$serverName}: {$e->getMessage()}");
                }
            }

            return $allTools;
        });
    }

    /**
     * Call a tool by qualified name (server.toolName).
     */
    public function callTool(string $qualifiedName, array $arguments): mixed
    {
        [$serverName, $toolName] = explode('.', $qualifiedName, 2);

        $client = $this->clients[$serverName]
            ?? throw new \RuntimeException("Server not connected: {$serverName}");

        Log::info("MCP tool call", [
            'server' => $serverName,
            'tool' => $toolName,
            'arguments' => $arguments,
        ]);

        return $client->callTool($toolName, $arguments);
    }

    /**
     * Disconnect all clients.
     */
    public function disconnectAll(): void
    {
        foreach ($this->clients as $name => $client) {
            try {
                $client->disconnect();
            } catch (\Exception $e) {
                Log::warning("Error disconnecting {$name}: {$e->getMessage()}");
            }
        }

        $this->clients = [];
        Cache::forget('mcp_all_tools');
    }

    private function createTransport(array $config): mixed
    {
        return match ($config['transport'] ?? 'stdio') {
            'stdio' => new StdioTransport(
                command: $config['command'],
                args: $config['args'] ?? [],
                env: $this->resolveEnvVars($config['env'] ?? [])
            ),
            'http' => new HttpTransport(
                url: $config['url'],
                headers: $config['headers'] ?? []
            ),
            default => throw new \InvalidArgumentException(
                "Unknown transport: {$config['transport']}"
            ),
        };
    }

    private function resolveEnvVars(array $env): array
    {
        return array_map(function ($value) {
            if (is_string($value) && str_starts_with($value, 'env:')) {
                return getenv(substr($value, 4)) ?: '';
            }
            return $value;
        }, $env);
    }
}
```

---

## LLaMA Agent Integration

### MCP-Aware Agent with Reflection Prompts

Integrate MCP tools with Rea's existing LLaMA agents and Reflection prompt framework:

```php title="app/Services/Agent/McpAwareAgent.php"
<?php

namespace App\Services\Agent;

use App\Services\MCP\ReaMcpHost;
use App\Services\LlamaClient;
use App\Services\ReflectionPromptBuilder;

class McpAwareAgent
{
    public function __construct(
        private ReaMcpHost $mcpHost,
        private LlamaClient $llama,
        private ReflectionPromptBuilder $promptBuilder
    ) {}

    /**
     * Process a user query with MCP tool access.
     */
    public function processWithTools(string $userQuery, array $context = []): AgentResponse
    {
        // Get available tools from all connected MCP servers
        $tools = $this->mcpHost->getAvailableTools();

        // Build system prompt with Reflection framework and tool definitions
        $systemPrompt = $this->promptBuilder
            ->withReflection()
            ->withTools($tools)
            ->withContext($context)
            ->build();

        // Get LLM response with potential tool calls
        $response = $this->llama->chat([
            'system' => $systemPrompt,
            'user' => $userQuery,
            'tools' => $this->formatToolsForLlama($tools),
        ]);

        // Execute any requested tool calls
        if ($response->hasToolCalls()) {
            return $this->executeToolCalls($response, $userQuery);
        }

        return new AgentResponse($response->content);
    }

    /**
     * Execute tool calls and continue conversation.
     */
    private function executeToolCalls(LlamaResponse $response, string $originalQuery): AgentResponse
    {
        $toolResults = [];

        foreach ($response->toolCalls as $call) {
            try {
                $result = $this->mcpHost->callTool(
                    $call->name,
                    $call->arguments
                );

                $toolResults[] = [
                    'tool_call_id' => $call->id,
                    'result' => $this->formatToolResult($result),
                ];
            } catch (\Exception $e) {
                $toolResults[] = [
                    'tool_call_id' => $call->id,
                    'error' => $e->getMessage(),
                ];
            }
        }

        // Continue conversation with tool results
        $followUp = $this->llama->continueWithToolResults(
            $response->conversationId,
            $toolResults
        );

        // Recursively handle any additional tool calls
        if ($followUp->hasToolCalls()) {
            return $this->executeToolCalls($followUp, $originalQuery);
        }

        return new AgentResponse(
            content: $followUp->content,
            toolsUsed: array_map(fn($c) => $c->name, $response->toolCalls)
        );
    }

    /**
     * Format MCP tools for LLaMA's function calling format.
     */
    private function formatToolsForLlama(array $mcpTools): array
    {
        return array_map(function ($tool) {
            return [
                'type' => 'function',
                'function' => [
                    'name' => $tool['qualifiedName'],
                    'description' => $tool['description'],
                    'parameters' => $tool['inputSchema'],
                ],
            ];
        }, $mcpTools);
    }

    private function formatToolResult(array $result): string
    {
        $content = $result['content'] ?? [];

        foreach ($content as $item) {
            if ($item['type'] === 'text') {
                return $item['text'];
            }
        }

        return json_encode($content);
    }
}
```

### Reflection Prompt Builder

Extend the existing Reflection prompt framework to include MCP tools:

```php title="app/Services/ReflectionPromptBuilder.php"
<?php

namespace App\Services;

class ReflectionPromptBuilder
{
    private bool $useReflection = false;
    private array $tools = [];
    private array $context = [];

    public function withReflection(): self
    {
        $this->useReflection = true;
        return $this;
    }

    public function withTools(array $tools): self
    {
        $this->tools = $tools;
        return $this;
    }

    public function withContext(array $context): self
    {
        $this->context = $context;
        return $this;
    }

    public function build(): string
    {
        $prompt = $this->getBasePrompt();

        if ($this->useReflection) {
            $prompt .= $this->getReflectionInstructions();
        }

        if (!empty($this->tools)) {
            $prompt .= $this->getToolInstructions();
        }

        if (!empty($this->context)) {
            $prompt .= $this->getContextSection();
        }

        return $prompt;
    }

    private function getBasePrompt(): string
    {
        return <<<PROMPT
        You are Rea, an AI assistant within the Multiply Universe platform.
        You help users with automations, consulting workflows, and cross-app tasks.

        PROMPT;
    }

    private function getReflectionInstructions(): string
    {
        return <<<PROMPT

        ## Reflection Framework

        Before responding, always:
        1. **Understand**: Restate the user's request in your own words
        2. **Plan**: Outline the steps needed to fulfill the request
        3. **Execute**: Carry out the plan, using tools when helpful
        4. **Verify**: Check that your response addresses the original request
        5. **Reflect**: Consider if there's a better approach

        PROMPT;
    }

    private function getToolInstructions(): string
    {
        $toolList = array_map(function ($tool) {
            return "- **{$tool['qualifiedName']}**: {$tool['description']}";
        }, $this->tools);

        $toolListStr = implode("\n", $toolList);

        return <<<PROMPT

        ## Available Tools

        You have access to the following tools via MCP:

        {$toolListStr}

        When using tools:
        - Use tools when they would help answer the user's question
        - Explain what you're doing before calling a tool
        - Summarize tool results in a helpful way
        - Request user approval for destructive operations

        PROMPT;
    }

    private function getContextSection(): string
    {
        $contextStr = json_encode($this->context, JSON_PRETTY_PRINT);

        return <<<PROMPT

        ## Current Context

        ```json
        {$contextStr}
        ```

        PROMPT;
    }
}
```

---

## Exposing Rea as an MCP Server

### Rea MCP Server Implementation

Expose Rea's consulting pods and Command Room as MCP capabilities:

```php title="app/MCP/ReaMcpServer.php"
<?php

namespace App\MCP;

use Mcp\Capability\Attribute\McpTool;
use Mcp\Capability\Attribute\McpResource;
use Mcp\Capability\Attribute\McpPrompt;
use App\Services\ConsultingPodService;
use App\Services\CommandRoomService;
use App\Services\WorkflowService;

class ReaMcpServer
{
    public function __construct(
        private ConsultingPodService $podService,
        private CommandRoomService $commandRoom,
        private WorkflowService $workflows
    ) {}

    // =====================
    // TOOLS
    // =====================

    #[McpTool(
        name: 'rea_create_pod',
        description: 'Create a new consulting pod (multi-agent workflow)'
    )]
    public function createPod(
        string $name,
        string $description,
        array $agents,
        ?array $config = null
    ): array {
        $pod = $this->podService->create([
            'name' => $name,
            'description' => $description,
            'agents' => $agents,
            'config' => $config ?? [],
        ]);

        return [
            'status' => 'success',
            'pod_id' => $pod->id,
            'message' => "Created consulting pod: {$name}",
        ];
    }

    #[McpTool(
        name: 'rea_run_pod',
        description: 'Execute a consulting pod with given inputs'
    )]
    public function runPod(
        string $podId,
        array $inputs,
        ?bool $async = false
    ): array {
        $pod = $this->podService->find($podId);

        if (!$pod) {
            return ['error' => "Pod not found: {$podId}"];
        }

        if ($async) {
            $jobId = $this->podService->executeAsync($pod, $inputs);
            return [
                'status' => 'queued',
                'job_id' => $jobId,
                'message' => 'Pod execution queued',
            ];
        }

        $result = $this->podService->execute($pod, $inputs);

        return [
            'status' => 'completed',
            'output' => $result->output,
            'agents_used' => $result->agentsUsed,
            'execution_time_ms' => $result->executionTime,
        ];
    }

    #[McpTool(
        name: 'rea_search_command_room',
        description: 'Search Command Room for captured activities and suggestions'
    )]
    public function searchCommandRoom(
        string $query,
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?int $limit = 20
    ): array {
        $results = $this->commandRoom->search([
            'query' => $query,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'limit' => $limit,
        ]);

        return [
            'results' => $results->items,
            'total' => $results->total,
            'suggestions' => $results->automationSuggestions,
        ];
    }

    #[McpTool(
        name: 'rea_trigger_workflow',
        description: 'Trigger an n8n workflow with given parameters'
    )]
    public function triggerWorkflow(
        string $workflowId,
        array $parameters
    ): array {
        $execution = $this->workflows->trigger($workflowId, $parameters);

        return [
            'status' => 'triggered',
            'execution_id' => $execution->id,
            'workflow_name' => $execution->workflow->name,
        ];
    }

    #[McpTool(
        name: 'rea_list_pods',
        description: 'List available consulting pods'
    )]
    public function listPods(?string $category = null): array
    {
        $pods = $this->podService->list($category);

        return array_map(fn($pod) => [
            'id' => $pod->id,
            'name' => $pod->name,
            'description' => $pod->description,
            'agent_count' => count($pod->agents),
            'category' => $pod->category,
        ], $pods);
    }

    // =====================
    // RESOURCES
    // =====================

    #[McpResource(
        uri: 'rea://pods',
        name: 'All Consulting Pods',
        mimeType: 'application/json'
    )]
    public function getAllPods(): array
    {
        return $this->podService->all()->toArray();
    }

    #[McpResource(
        uri: 'rea://pods/{podId}',
        name: 'Consulting Pod Details',
        mimeType: 'application/json',
        isTemplate: true
    )]
    public function getPodDetails(string $podId): array
    {
        $pod = $this->podService->find($podId);

        if (!$pod) {
            throw new \RuntimeException("Pod not found: {$podId}");
        }

        return [
            'id' => $pod->id,
            'name' => $pod->name,
            'description' => $pod->description,
            'agents' => $pod->agents,
            'config' => $pod->config,
            'executions' => $pod->recentExecutions(5),
            'created_at' => $pod->created_at->toIso8601String(),
        ];
    }

    #[McpResource(
        uri: 'rea://command-room/recent',
        name: 'Recent Command Room Activity',
        mimeType: 'application/json'
    )]
    public function getRecentActivity(): array
    {
        return $this->commandRoom->getRecent(50)->toArray();
    }

    #[McpResource(
        uri: 'rea://workflows',
        name: 'Available Workflows',
        mimeType: 'application/json'
    )]
    public function getWorkflows(): array
    {
        return $this->workflows->list()->toArray();
    }

    // =====================
    // PROMPTS
    // =====================

    #[McpPrompt(
        name: 'rea_automation_analysis',
        description: 'Analyze Command Room data to suggest automations'
    )]
    public function automationAnalysis(?int $days = 7): array
    {
        $recentActivity = $this->commandRoom->getRecent($days * 24);

        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => <<<PROMPT
                    Analyze the following Command Room activity from the past {$days} days
                    and suggest automations that could save time:

                    Activity Summary:
                    - Total activities: {$recentActivity->count()}
                    - Top apps used: {$recentActivity->topApps()->implode(', ')}
                    - Repetitive patterns: {$recentActivity->patterns()->count()} detected

                    Please identify:
                    1. Repetitive tasks that could be automated
                    2. Cross-app workflows that could be streamlined
                    3. Time-consuming activities with automation potential

                    For each suggestion, provide:
                    - Description of the automation
                    - Estimated time savings per week
                    - Complexity (low/medium/high)
                    - Recommended approach (n8n workflow, consulting pod, or MCP tool)
                    PROMPT
                ]
            ]
        ];
    }

    #[McpPrompt(
        name: 'rea_pod_builder',
        description: 'Interactive prompt for designing a new consulting pod'
    )]
    public function podBuilder(string $objective): array
    {
        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => <<<PROMPT
                    Help me design a consulting pod for the following objective:

                    **Objective:** {$objective}

                    Please recommend:
                    1. What specialized agents should be in the pod
                    2. How the agents should collaborate
                    3. What inputs the pod needs
                    4. What outputs it should produce
                    5. Any MCP integrations that would enhance it

                    Format your response as a pod configuration that can be created
                    using the rea_create_pod tool.
                    PROMPT
                ]
            ]
        ];
    }
}
```

### Server Entry Point

```php title="mcp-server.php"
<?php

require_once __DIR__ . '/vendor/autoload.php';

use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;
use Mcp\Server\Session\FileSessionStore;

// Suppress output to stdout
ini_set('display_errors', '0');
ini_set('error_log', 'php://stderr');

// Bootstrap Laravel (or your framework)
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

// Create MCP server
$server = Server::builder()
    ->setServerInfo('Rea.pro MCP Server', config('app.version', '1.0.0'))
    ->setInstructions(<<<INSTRUCTIONS
    Rea.pro MCP Server provides access to:
    - Consulting Pods: Multi-agent workflows for complex tasks
    - Command Room: Activity capture and automation suggestions
    - Workflows: n8n-based automation triggers

    Use rea_list_pods to discover available consulting pods.
    Use rea_search_command_room to find relevant past activities.
    INSTRUCTIONS)
    ->setContainer(app())
    ->setDiscovery(__DIR__ . '/app/MCP', ['.'])
    ->setSession(new FileSessionStore(storage_path('mcp-sessions')))
    ->build();

// Run with stdio transport
$transport = new StdioTransport();
$server->run($transport);
```

### Artisan Command

```php title="app/Console/Commands/McpServe.php"
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;

class McpServe extends Command
{
    protected $signature = 'mcp:serve {--transport=stdio}';
    protected $description = 'Start the Rea MCP server';

    public function handle(Server $server): int
    {
        $this->info('Starting Rea MCP server...');

        $transport = match ($this->option('transport')) {
            'stdio' => new StdioTransport(),
            default => throw new \InvalidArgumentException('Unknown transport'),
        };

        $server->run($transport);

        return 0;
    }
}
```

---

## Configuration

```php title="config/mcp.php"
<?php

return [
    /*
    |--------------------------------------------------------------------------
    | External MCP Servers (Rea as Client)
    |--------------------------------------------------------------------------
    */
    'servers' => [
        'notion' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => ['-y', '@notionhq/notion-mcp-server'],
            'env' => [
                'NOTION_TOKEN' => 'env:NOTION_TOKEN',
            ],
            'enabled' => true,
        ],

        'slack' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => ['-y', '@modelcontextprotocol/server-slack'],
            'env' => [
                'SLACK_BOT_TOKEN' => 'env:SLACK_BOT_TOKEN',
                'SLACK_TEAM_ID' => 'env:SLACK_TEAM_ID',
            ],
            'enabled' => true,
        ],

        'filesystem' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => [
                '-y',
                '@modelcontextprotocol/server-filesystem',
                storage_path('user-files'),
            ],
            'enabled' => true,
        ],

        'github' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => ['-y', '@modelcontextprotocol/server-github'],
            'env' => [
                'GITHUB_PERSONAL_ACCESS_TOKEN' => 'env:GITHUB_TOKEN',
            ],
            'enabled' => false,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Session Configuration
    |--------------------------------------------------------------------------
    */
    'session' => [
        'driver' => env('MCP_SESSION_DRIVER', 'redis'),
        'ttl' => env('MCP_SESSION_TTL', 3600),
        'prefix' => 'rea-mcp-',
    ],

    /*
    |--------------------------------------------------------------------------
    | Security
    |--------------------------------------------------------------------------
    */
    'security' => [
        'require_user_consent' => true,
        'allowed_tools' => ['*'],
        'blocked_tools' => [],
        'audit_logging' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Caching
    |--------------------------------------------------------------------------
    */
    'cache' => [
        'enabled' => true,
        'ttl' => 300,
        'store' => 'redis',
    ],
];
```

---

## Phased Rollout Plan

Based on the existing MCP prototype work and Rea's architecture:

### Phase 1: Foundation (2-3 weeks)

- [ ] Install official PHP SDK
- [ ] Implement ReaMcpHost wrapper class
- [ ] Add configuration system
- [ ] Create stdio transport handler
- [ ] Basic connection tests

### Phase 2: External Server Integration (3-4 weeks)

- [ ] Integrate Notion MCP server
- [ ] Integrate Slack MCP server
- [ ] Integrate filesystem server
- [ ] Build tool discovery and caching
- [ ] Integrate with LLaMA agent prompts
- [ ] Add user consent UI

### Phase 3: Rea MCP Server (3-4 weeks)

- [ ] Expose consulting pods as tools
- [ ] Expose Command Room as resources
- [ ] Create workflow triggers as tools
- [ ] Add automation prompts
- [ ] Implement authentication for external clients

### Phase 4: Production Hardening (2-3 weeks)

- [ ] Redis session management
- [ ] Comprehensive error handling
- [ ] Rate limiting per server/tool
- [ ] Monitoring and logging
- [ ] Security audit
- [ ] Performance optimization

---

## Testing with Claude Desktop

Configure Claude Desktop to connect to the Rea MCP server:

```json title="~/Library/Application Support/Claude/claude_desktop_config.json"
{
  "mcpServers": {
    "rea-pro": {
      "command": "php",
      "args": ["/path/to/rea/artisan", "mcp:serve", "--transport=stdio"],
      "env": {
        "REA_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## Next Steps

- [Notion MCP Tutorial](../tutorials/notion-mcp.md) - Detailed Notion integration
- [Security Reference](../reference/security.md) - Security best practices
- [API Reference](../reference/api.md) - Complete API documentation
