# PHP MCP Server Implementation

This guide covers building your own MCP server in PHP to expose custom tools, resources, and prompts.

## Overview

An MCP server exposes capabilities to clients:

- **Tools** - Functions the AI can call
- **Resources** - Data the application can access
- **Prompts** - Predefined workflow templates

## Using the PHP SDK

### Installation

```bash
composer require mcp/sdk
```

### Basic Server Structure

```php title="server.php"
<?php

require_once __DIR__ . '/vendor/autoload.php';

use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;

// Create server
$server = Server::builder()
    ->setServerInfo('My MCP Server', '1.0.0')
    ->setInstructions('Custom server for Rea integration')
    ->setDiscovery(__DIR__ . '/src', ['.'])
    ->build();

// Run with stdio transport
$transport = new StdioTransport();
$server->run($transport);
```

---

## Defining Tools

Use the `#[McpTool]` attribute to define tools:

```php title="src/Tools/CalculatorTools.php"
<?php

namespace App\Tools;

use Mcp\Capability\Attribute\McpTool;

class CalculatorTools
{
    #[McpTool(
        name: 'add',
        description: 'Add two numbers together'
    )]
    public function add(int $a, int $b): int
    {
        return $a + $b;
    }

    #[McpTool(
        name: 'multiply',
        description: 'Multiply two numbers'
    )]
    public function multiply(float $a, float $b): float
    {
        return $a * $b;
    }

    #[McpTool(
        name: 'calculate',
        description: 'Perform a calculation with the given expression'
    )]
    public function calculate(
        string $expression,
        ?int $precision = 2
    ): array {
        // Safely evaluate mathematical expression
        $result = $this->evaluateExpression($expression);

        return [
            'expression' => $expression,
            'result' => round($result, $precision),
        ];
    }

    private function evaluateExpression(string $expression): float
    {
        // Only allow safe mathematical operations
        if (!preg_match('/^[\d\s\+\-\*\/\(\)\.]+$/', $expression)) {
            throw new \InvalidArgumentException('Invalid expression');
        }

        return eval("return {$expression};");
    }
}
```

### Tool Input Schema

The SDK automatically generates JSON Schema from PHP type hints:

```php
#[McpTool(name: 'create_user')]
public function createUser(
    string $name,           // Required string
    string $email,          // Required string
    ?int $age = null,       // Optional integer
    bool $active = true     // Optional boolean with default
): array {
    // Implementation
}
```

Generates:

```json
{
  "name": "create_user",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "email": {"type": "string"},
      "age": {"type": "integer"},
      "active": {"type": "boolean", "default": true}
    },
    "required": ["name", "email"]
  }
}
```

---

## Defining Resources

Use the `#[McpResource]` attribute:

```php title="src/Resources/ConfigResources.php"
<?php

namespace App\Resources;

use Mcp\Capability\Attribute\McpResource;

class ConfigResources
{
    #[McpResource(
        uri: 'config://app/settings',
        name: 'Application Settings',
        mimeType: 'application/json'
    )]
    public function getSettings(): array
    {
        return [
            'app_name' => config('app.name'),
            'version' => config('app.version'),
            'environment' => config('app.env'),
        ];
    }

    #[McpResource(
        uri: 'file://logs/{date}',
        name: 'Daily Log File',
        mimeType: 'text/plain',
        isTemplate: true
    )]
    public function getLogFile(string $date): string
    {
        $path = storage_path("logs/laravel-{$date}.log");

        if (!file_exists($path)) {
            throw new \RuntimeException("Log file not found: {$date}");
        }

        return file_get_contents($path);
    }
}
```

---

## Defining Prompts

Use the `#[McpPrompt]` attribute:

```php title="src/Prompts/CodePrompts.php"
<?php

namespace App\Prompts;

use Mcp\Capability\Attribute\McpPrompt;

class CodePrompts
{
    #[McpPrompt(
        name: 'code_review',
        description: 'Review code for issues and improvements'
    )]
    public function codeReview(
        string $code,
        ?string $language = null,
        ?string $focus = null
    ): array {
        $languageHint = $language ? "The code is written in {$language}." : '';
        $focusHint = $focus ? "Focus on: {$focus}" : 'Cover all aspects.';

        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => <<<PROMPT
                    Please review this code:

                    ```{$language}
                    {$code}
                    ```

                    {$languageHint}
                    {$focusHint}

                    Provide:
                    1. Summary
                    2. Issues found
                    3. Improvements
                    PROMPT
                ]
            ]
        ];
    }

    #[McpPrompt(
        name: 'explain_error',
        description: 'Explain an error message and suggest fixes'
    )]
    public function explainError(
        string $error,
        ?string $context = null
    ): array {
        $contextText = $context ? "Context:\n{$context}\n\n" : '';

        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => "{$contextText}Explain this error and suggest fixes:\n\n{$error}"
                ]
            ]
        ];
    }
}
```

---

## Database Integration Example

```php title="src/Tools/DatabaseTools.php"
<?php

namespace App\Tools;

use Mcp\Capability\Attribute\McpTool;
use PDO;

class DatabaseTools
{
    private PDO $db;

    public function __construct()
    {
        $this->db = new PDO(
            getenv('DB_DSN'),
            getenv('DB_USER'),
            getenv('DB_PASSWORD')
        );
    }

    #[McpTool(
        name: 'query_users',
        description: 'Search for users by name or email'
    )]
    public function queryUsers(
        ?string $name = null,
        ?string $email = null,
        int $limit = 10
    ): array {
        $conditions = [];
        $params = [];

        if ($name !== null) {
            $conditions[] = 'name LIKE :name';
            $params['name'] = "%{$name}%";
        }

        if ($email !== null) {
            $conditions[] = 'email LIKE :email';
            $params['email'] = "%{$email}%";
        }

        $where = empty($conditions) ? '' : 'WHERE ' . implode(' AND ', $conditions);

        $stmt = $this->db->prepare(
            "SELECT id, name, email, created_at FROM users {$where} LIMIT :limit"
        );

        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }

        $stmt->execute();

        return [
            'users' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'count' => $stmt->rowCount(),
        ];
    }

    #[McpTool(
        name: 'get_user',
        description: 'Get a user by ID'
    )]
    public function getUser(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, name, email, created_at FROM users WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);

        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        return $user ?: null;
    }
}
```

---

## HTTP Transport Server

For remote access, use the HTTP transport:

```php title="http-server.php"
<?php

require_once __DIR__ . '/vendor/autoload.php';

use Mcp\Server;
use Mcp\Server\Transport\StreamableHttpTransport;
use Mcp\Server\Session\FileSessionStore;

// Create server
$server = Server::builder()
    ->setServerInfo('My HTTP MCP Server', '1.0.0')
    ->setDiscovery(__DIR__ . '/src', ['.'])
    ->setSession(new FileSessionStore(__DIR__ . '/sessions'))
    ->build();

// Configure HTTP transport
$transport = new StreamableHttpTransport(
    port: 8080,
    host: '127.0.0.1',
    authToken: getenv('MCP_AUTH_TOKEN')
);

// Run server
$server->run($transport);
```

Run with:

```bash
MCP_AUTH_TOKEN=your-secret-token php http-server.php
```

---

## Laravel Integration

### Service Provider

```php title="app/Providers/MCPServerServiceProvider.php"
<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Mcp\Server;
use Mcp\Server\Session\Psr16SessionStore;

class MCPServerServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(Server::class, function ($app) {
            return Server::builder()
                ->setServerInfo('Rea MCP Server', config('app.version'))
                ->setContainer($app)
                ->setDiscovery(app_path('MCP'), ['.'])
                ->setSession(new Psr16SessionStore(
                    $app->make('cache.store')
                ))
                ->build();
        });
    }
}
```

### Artisan Command

```php title="app/Console/Commands/MCPServe.php"
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;

class MCPServe extends Command
{
    protected $signature = 'mcp:serve';
    protected $description = 'Start the MCP server';

    public function handle(Server $server): int
    {
        $this->info('Starting MCP server...');

        $transport = new StdioTransport();
        $server->run($transport);

        return 0;
    }
}
```

---

## Security Best Practices

### Input Validation

```php
#[McpTool(name: 'execute_query')]
public function executeQuery(string $query): array
{
    // Validate query is read-only
    $normalized = strtoupper(trim($query));

    if (!str_starts_with($normalized, 'SELECT')) {
        throw new \InvalidArgumentException(
            'Only SELECT queries are allowed'
        );
    }

    // Check for dangerous patterns
    $dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE'];
    foreach ($dangerous as $keyword) {
        if (str_contains($normalized, $keyword)) {
            throw new \InvalidArgumentException(
                "Query contains forbidden keyword: {$keyword}"
            );
        }
    }

    return $this->db->query($query)->fetchAll();
}
```

### Rate Limiting

```php
#[McpTool(name: 'expensive_operation')]
public function expensiveOperation(string $input): array
{
    $key = 'mcp_rate_' . md5($input);

    if (Cache::has($key)) {
        throw new \RuntimeException('Rate limited. Try again later.');
    }

    Cache::put($key, true, 60); // 1 minute cooldown

    return $this->doExpensiveWork($input);
}
```

### Audit Logging

```php
#[McpTool(name: 'sensitive_operation')]
public function sensitiveOperation(int $userId): array
{
    Log::info('MCP sensitive operation', [
        'tool' => 'sensitive_operation',
        'user_id' => $userId,
        'timestamp' => now()->toIso8601String(),
    ]);

    return $this->performOperation($userId);
}
```

---

## Testing Your Server

### MCP Inspector

Use the MCP Inspector for interactive testing:

```bash
npx @modelcontextprotocol/inspector php server.php
```

This opens a web UI where you can:

- View available tools, resources, and prompts
- Test tool execution with custom arguments
- Inspect request/response messages
- Debug connection issues

### Unit Testing

```php title="tests/Unit/CalculatorToolsTest.php"
<?php

namespace Tests\Unit;

use App\Tools\CalculatorTools;
use PHPUnit\Framework\TestCase;

class CalculatorToolsTest extends TestCase
{
    private CalculatorTools $tools;

    protected function setUp(): void
    {
        $this->tools = new CalculatorTools();
    }

    public function test_add(): void
    {
        $result = $this->tools->add(2, 3);
        $this->assertEquals(5, $result);
    }

    public function test_multiply(): void
    {
        $result = $this->tools->multiply(2.5, 4);
        $this->assertEquals(10.0, $result);
    }

    public function test_calculate_with_expression(): void
    {
        $result = $this->tools->calculate('(2 + 3) * 4');
        $this->assertEquals(20, $result['result']);
    }

    public function test_calculate_rejects_invalid_expression(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->tools->calculate('system("rm -rf /")');
    }
}
```

---

## Next Steps

- [Rea Integration](rea-integration.md) - Integrate with Rea platform
- [Security Reference](../reference/security.md) - Security best practices
- [API Reference](../reference/api.md) - Complete API documentation
