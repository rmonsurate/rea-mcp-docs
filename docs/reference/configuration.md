# Configuration Reference

Complete configuration options for MCP integration in Rea.

## Configuration File

```php title="config/mcp.php"
<?php

return [
    /*
    |--------------------------------------------------------------------------
    | MCP Servers
    |--------------------------------------------------------------------------
    |
    | Configure your MCP server connections. Each server can use either
    | 'stdio' transport (local process) or 'http' transport (remote).
    |
    */
    'servers' => [
        'notion' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => ['-y', '@notionhq/notion-mcp-server'],
            'env' => [
                'NOTION_TOKEN' => env('NOTION_TOKEN'),
            ],
            'timeout' => 30,
        ],

        'slack' => [
            'transport' => 'stdio',
            'command' => 'npx',
            'args' => ['-y', '@modelcontextprotocol/server-slack'],
            'env' => [
                'SLACK_BOT_TOKEN' => env('SLACK_BOT_TOKEN'),
                'SLACK_TEAM_ID' => env('SLACK_TEAM_ID'),
            ],
        ],

        'custom' => [
            'transport' => 'http',
            'url' => env('CUSTOM_MCP_URL'),
            'headers' => [
                'Authorization' => 'Bearer ' . env('CUSTOM_MCP_TOKEN'),
            ],
            'timeout' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache Settings
    |--------------------------------------------------------------------------
    |
    | Configure caching for tool discovery and resource metadata.
    |
    */
    'cache' => [
        'enabled' => env('MCP_CACHE_ENABLED', true),
        'ttl' => env('MCP_CACHE_TTL', 300),
        'prefix' => 'mcp_',
        'store' => env('MCP_CACHE_STORE', 'redis'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Security Settings
    |--------------------------------------------------------------------------
    */
    'security' => [
        // Tools requiring human approval
        'require_approval' => [
            'delete',
            'archive',
            'send_message',
            'create_user',
        ],

        // Enable audit logging
        'audit_logging' => env('MCP_AUDIT_LOGGING', true),

        // Tool blacklist (never allow these)
        'tool_blacklist' => [
            // 'dangerous_tool',
        ],

        // Maximum arguments size (bytes)
        'max_argument_size' => 1024 * 1024, // 1MB
    ],

    /*
    |--------------------------------------------------------------------------
    | Connection Settings
    |--------------------------------------------------------------------------
    */
    'connection' => [
        // Default timeout for operations (seconds)
        'timeout' => env('MCP_TIMEOUT', 30),

        // Reconnect on failure
        'reconnect' => env('MCP_RECONNECT', true),

        // Delay between reconnection attempts (seconds)
        'reconnect_delay' => env('MCP_RECONNECT_DELAY', 5),

        // Maximum reconnection attempts
        'max_reconnect_attempts' => env('MCP_MAX_RECONNECT', 3),

        // Health check interval (seconds, 0 to disable)
        'health_check_interval' => env('MCP_HEALTH_CHECK_INTERVAL', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate Limiting
    |--------------------------------------------------------------------------
    */
    'rate_limits' => [
        // Global rate limit per user (requests per minute)
        'per_user' => env('MCP_RATE_LIMIT_USER', 60),

        // Per-tool rate limit (requests per minute)
        'per_tool' => env('MCP_RATE_LIMIT_TOOL', 30),

        // Expensive tools (lower rate limit)
        'expensive_tools' => [
            'search' => 10,
            'query_database' => 10,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Logging
    |--------------------------------------------------------------------------
    */
    'logging' => [
        'channel' => env('MCP_LOG_CHANNEL', 'mcp'),
        'level' => env('MCP_LOG_LEVEL', 'info'),

        // Log tool arguments (may contain sensitive data)
        'log_arguments' => env('MCP_LOG_ARGUMENTS', false),

        // Log tool results
        'log_results' => env('MCP_LOG_RESULTS', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Feature Flags
    |--------------------------------------------------------------------------
    */
    'features' => [
        // Enable resources support
        'resources' => env('MCP_FEATURE_RESOURCES', true),

        // Enable prompts support
        'prompts' => env('MCP_FEATURE_PROMPTS', true),

        // Enable sampling (server can request AI completions)
        'sampling' => env('MCP_FEATURE_SAMPLING', false),

        // Enable elicitation (server can request user input)
        'elicitation' => env('MCP_FEATURE_ELICITATION', false),
    ],
];
```

---

## Environment Variables

```bash title=".env"
# Server Credentials
NOTION_TOKEN=ntn_your_token_here
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_TEAM_ID=T00000000
CUSTOM_MCP_URL=https://mcp.example.com
CUSTOM_MCP_TOKEN=your-secret-token

# Cache Settings
MCP_CACHE_ENABLED=true
MCP_CACHE_TTL=300
MCP_CACHE_STORE=redis

# Connection Settings
MCP_TIMEOUT=30
MCP_RECONNECT=true
MCP_RECONNECT_DELAY=5
MCP_MAX_RECONNECT=3
MCP_HEALTH_CHECK_INTERVAL=60

# Rate Limiting
MCP_RATE_LIMIT_USER=60
MCP_RATE_LIMIT_TOOL=30

# Logging
MCP_LOG_CHANNEL=mcp
MCP_LOG_LEVEL=info
MCP_LOG_ARGUMENTS=false
MCP_LOG_RESULTS=false
MCP_AUDIT_LOGGING=true

# Feature Flags
MCP_FEATURE_RESOURCES=true
MCP_FEATURE_PROMPTS=true
MCP_FEATURE_SAMPLING=false
MCP_FEATURE_ELICITATION=false
```

---

## Server Configuration

### stdio Transport

```php
'notion' => [
    'transport' => 'stdio',

    // Command to execute
    'command' => 'npx',

    // Command arguments
    'args' => ['-y', '@notionhq/notion-mcp-server'],

    // Environment variables
    'env' => [
        'NOTION_TOKEN' => env('NOTION_TOKEN'),
    ],

    // Working directory (optional)
    'cwd' => base_path(),

    // Connection timeout (seconds)
    'timeout' => 30,

    // Process start timeout (seconds)
    'start_timeout' => 10,
],
```

### HTTP Transport

```php
'remote' => [
    'transport' => 'http',

    // Server URL
    'url' => 'https://mcp.example.com',

    // Request headers
    'headers' => [
        'Authorization' => 'Bearer ' . env('MCP_TOKEN'),
        'X-Client-Id' => env('MCP_CLIENT_ID'),
    ],

    // Request timeout (seconds)
    'timeout' => 60,

    // Verify SSL certificates
    'verify_ssl' => true,

    // Retry configuration
    'retry' => [
        'times' => 3,
        'sleep' => 1000, // milliseconds
        'when' => function ($exception) {
            return $exception->getCode() >= 500;
        },
    ],
],
```

---

## Logging Configuration

```php title="config/logging.php"
'channels' => [
    'mcp' => [
        'driver' => 'daily',
        'path' => storage_path('logs/mcp.log'),
        'level' => env('MCP_LOG_LEVEL', 'info'),
        'days' => 14,
    ],

    'mcp_audit' => [
        'driver' => 'daily',
        'path' => storage_path('logs/mcp-audit.log'),
        'level' => 'info',
        'days' => 90,
    ],
],
```

---

## Rate Limiting Configuration

```php title="app/Providers/RouteServiceProvider.php"
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;

public function boot(): void
{
    $this->configureRateLimiting();
}

protected function configureRateLimiting(): void
{
    RateLimiter::for('mcp', function (Request $request) {
        $user = $request->user();
        $tool = $request->input('tool');

        $limits = [
            Limit::perMinute(config('mcp.rate_limits.per_user'))
                ->by($user?->id ?: $request->ip()),
        ];

        // Add per-tool limit
        if ($tool) {
            $toolLimit = config("mcp.rate_limits.expensive_tools.{$tool}")
                ?? config('mcp.rate_limits.per_tool');

            $limits[] = Limit::perMinute($toolLimit)
                ->by("{$user?->id}:{$tool}");
        }

        return $limits;
    });
}
```

---

## Queue Configuration

For async tool execution:

```php title="config/queue.php"
'connections' => [
    'mcp' => [
        'driver' => 'redis',
        'connection' => 'mcp',
        'queue' => 'mcp',
        'retry_after' => 90,
        'block_for' => null,
    ],
],
```

```php title="config/database.php"
'redis' => [
    'mcp' => [
        'url' => env('MCP_REDIS_URL'),
        'host' => env('MCP_REDIS_HOST', '127.0.0.1'),
        'password' => env('MCP_REDIS_PASSWORD'),
        'port' => env('MCP_REDIS_PORT', '6379'),
        'database' => env('MCP_REDIS_DB', '2'),
    ],
],
```

---

## Health Check Configuration

```php title="config/health.php"
return [
    'checks' => [
        \App\Health\MCPConnectionCheck::class => [
            'connections' => ['notion', 'slack'],
            'timeout' => 5,
        ],
    ],
];
```

```php title="app/Health/MCPConnectionCheck.php"
<?php

namespace App\Health;

use App\Services\MCP\MCPManagerService;
use Spatie\Health\Checks\Check;
use Spatie\Health\Checks\Result;

class MCPConnectionCheck extends Check
{
    public function __construct(
        private MCPManagerService $mcp,
        private array $connections = [],
        private int $timeout = 5
    ) {}

    public function run(): Result
    {
        $result = Result::make();
        $failures = [];

        foreach ($this->connections as $name) {
            try {
                $client = $this->mcp->getClientByName($name);
                $client->listTools();
            } catch (\Exception $e) {
                $failures[] = "{$name}: {$e->getMessage()}";
            }
        }

        if (empty($failures)) {
            return $result->ok('All MCP connections healthy');
        }

        return $result->failed(implode(', ', $failures));
    }
}
```

---

## Publishing Configuration

Publish the configuration file:

```bash
php artisan vendor:publish --tag=mcp-config
```

---

## Validation

Validate configuration on boot:

```php title="app/Providers/MCPServiceProvider.php"
public function boot(): void
{
    $this->validateConfiguration();
}

private function validateConfiguration(): void
{
    $servers = config('mcp.servers', []);

    foreach ($servers as $name => $config) {
        if (!isset($config['transport'])) {
            throw new \InvalidArgumentException(
                "MCP server '{$name}' missing transport"
            );
        }

        if ($config['transport'] === 'stdio') {
            if (!isset($config['command'])) {
                throw new \InvalidArgumentException(
                    "MCP server '{$name}' missing command"
                );
            }
        }

        if ($config['transport'] === 'http') {
            if (!isset($config['url'])) {
                throw new \InvalidArgumentException(
                    "MCP server '{$name}' missing url"
                );
            }
        }
    }
}
```

---

## Next Steps

- [Security Reference](security.md)
- [API Reference](api.md)
- [Rea Integration](../implementation/rea-integration.md)
