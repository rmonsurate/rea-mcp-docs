# Quick Start Guide

Get MCP working with Rea in under 15 minutes.

## Prerequisites

- Rea platform (v1.15+)
- PHP 8.1+ with Composer
- Node.js 18+ (for running MCP servers)
- A Notion account (for this tutorial)

## Step 1: Install the PHP MCP SDK

Add the MCP SDK to your Rea installation:

```bash
composer require mcp/sdk
```

!!! note "SDK Status"
    The PHP MCP SDK is currently in active development. Check the [official repository](https://github.com/modelcontextprotocol/php-sdk) for the latest version.

## Step 2: Create a Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"**
3. Configure:
   - Name: `Rea MCP Integration`
   - Associated workspace: Select your workspace
   - Capabilities: Enable all (Read, Update, Insert, Comment)
4. Click **Submit**
5. Copy the **Internal Integration Token** (starts with `ntn_`)

## Step 3: Grant Notion Access

For each Notion page/database you want to access:

1. Open the page in Notion
2. Click **"..."** (menu) → **"Add connections"**
3. Select your `Rea MCP Integration`

## Step 4: Configure MCP Server

Create an MCP configuration file in your Rea project:

=== "JSON Configuration"

    ```json title="config/mcp-servers.json"
    {
      "servers": {
        "notion": {
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "@notionhq/notion-mcp-server"],
          "env": {
            "NOTION_TOKEN": "${NOTION_TOKEN}"
          }
        }
      }
    }
    ```

=== "PHP Configuration"

    ```php title="config/mcp.php"
    <?php

    return [
        'servers' => [
            'notion' => [
                'transport' => 'stdio',
                'command' => 'npx',
                'args' => ['-y', '@notionhq/notion-mcp-server'],
                'env' => [
                    'NOTION_TOKEN' => env('NOTION_TOKEN'),
                ],
            ],
        ],
    ];
    ```

## Step 5: Set Environment Variable

Add your Notion token to `.env`:

```bash title=".env"
NOTION_TOKEN=ntn_your_token_here
```

!!! danger "Security Warning"
    Never commit API tokens to version control. Always use environment variables.

## Step 6: Initialize MCP in Rea

Create a service to manage MCP connections:

```php title="app/Services/MCPService.php"
<?php

namespace App\Services;

use Mcp\Client\Client;
use Mcp\Client\Transport\StdioClientTransport;

class MCPService
{
    private array $clients = [];

    public function __construct(
        private array $config
    ) {}

    public function connect(string $serverName): void
    {
        $serverConfig = $this->config['servers'][$serverName];

        $transport = new StdioClientTransport(
            command: $serverConfig['command'],
            args: $serverConfig['args'],
            env: array_map(
                fn($v) => str_starts_with($v, '${')
                    ? getenv(trim($v, '${}'))
                    : $v,
                $serverConfig['env']
            )
        );

        $client = new Client([
            'name' => 'rea-mcp-client',
            'version' => '1.0.0',
        ]);

        $client->connect($transport);

        $this->clients[$serverName] = $client;
    }

    public function listTools(string $serverName): array
    {
        return $this->clients[$serverName]->listTools();
    }

    public function callTool(string $serverName, string $toolName, array $args): mixed
    {
        return $this->clients[$serverName]->callTool([
            'name' => $toolName,
            'arguments' => $args,
        ]);
    }
}
```

## Step 7: Test the Connection

Create a simple test command:

```php title="app/Console/Commands/TestMCP.php"
<?php

namespace App\Console\Commands;

use App\Services\MCPService;
use Illuminate\Console\Command;

class TestMCP extends Command
{
    protected $signature = 'mcp:test';
    protected $description = 'Test MCP connection';

    public function handle(MCPService $mcp): int
    {
        $this->info('Connecting to Notion MCP server...');
        $mcp->connect('notion');

        $this->info('Listing available tools:');
        $tools = $mcp->listTools('notion');

        foreach ($tools as $tool) {
            $this->line("  - {$tool['name']}: {$tool['description']}");
        }

        $this->info('Testing search...');
        $result = $mcp->callTool('notion', 'search', [
            'query' => 'test',
        ]);

        $this->info('Search results:');
        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
```

Run the test:

```bash
php artisan mcp:test
```

## Expected Output

```
Connecting to Notion MCP server...
Listing available tools:
  - search: Search for pages and databases
  - get_page: Retrieve a page by ID
  - create_page: Create a new page
  - update_page: Update an existing page
  - query_database: Query a database
  ...

Testing search...
Search results:
{
  "results": [
    {
      "id": "abc123...",
      "title": "Test Page",
      "type": "page"
    }
  ]
}
```

## Troubleshooting

### "Command not found: npx"

Ensure Node.js is installed and in your PATH:

```bash
which npx
node --version
```

### "Token invalid" Error

1. Verify your token starts with `ntn_`
2. Regenerate the token in Notion integration settings
3. Check the `.env` file has no extra whitespace

### "Object not found" Error

The integration doesn't have access to the page/database:

1. Open the Notion page
2. Click "..." → "Add connections"
3. Select your integration

### Connection Timeout

The MCP server may be taking too long to start:

```php
$transport = new StdioClientTransport(
    command: $serverConfig['command'],
    args: $serverConfig['args'],
    env: $serverConfig['env'],
    timeout: 30000  // 30 seconds
);
```

## Next Steps

You now have MCP working with Notion. Continue with:

- [Core Concepts](../concepts/tools.md) - Understand tools, resources, and prompts
- [Notion MCP Tutorial](../tutorials/notion-mcp.md) - Complete Notion integration guide
- [PHP Client Implementation](../implementation/php-client.md) - Deep dive into the client

---

!!! success "Congratulations!"
    You've successfully connected Rea to Notion via MCP. Your AI agents can now search, read, and modify Notion content.
