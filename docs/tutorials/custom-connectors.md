# Building Custom MCP Connectors

Learn how to build custom MCP servers to expose your own tools, resources, and prompts.

## Overview

Custom MCP connectors allow you to:

- Expose internal APIs to Rea agents
- Create domain-specific tools
- Integrate proprietary systems
- Build reusable integration packages

## When to Build Custom

| Use Case | Recommendation |
|----------|---------------|
| Standard service (Notion, Slack) | Use existing server |
| Internal API | Build custom server |
| Proprietary system | Build custom server |
| Custom business logic | Build custom server |
| Modified existing server | Fork and customize |

---

## Quick Start

### 1. Create Project

```bash
mkdir my-mcp-server
cd my-mcp-server
composer init
composer require mcp/sdk
```

### 2. Create Server

```php title="server.php"
<?php

require_once __DIR__ . '/vendor/autoload.php';

use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;

$server = Server::builder()
    ->setServerInfo('My Custom Server', '1.0.0')
    ->setInstructions('Custom server for internal APIs')
    ->setDiscovery(__DIR__ . '/src', ['.'])
    ->build();

$transport = new StdioTransport();
$server->run($transport);
```

### 3. Create a Tool

```php title="src/Tools/HelloTools.php"
<?php

namespace MyServer\Tools;

use Mcp\Capability\Attribute\McpTool;

class HelloTools
{
    #[McpTool(
        name: 'greet',
        description: 'Greet someone by name'
    )]
    public function greet(string $name): string
    {
        return "Hello, {$name}!";
    }
}
```

### 4. Test

```bash
# Run with MCP Inspector
npx @modelcontextprotocol/inspector php server.php
```

---

## Building a Database Connector

Let's build a complete MCP server for querying a customer database.

### Project Structure

```
customer-mcp-server/
├── composer.json
├── server.php
├── config.php
└── src/
    ├── Tools/
    │   └── CustomerTools.php
    ├── Resources/
    │   └── CustomerResources.php
    └── Prompts/
        └── CustomerPrompts.php
```

### Configuration

```php title="config.php"
<?php

return [
    'database' => [
        'dsn' => getenv('DB_DSN') ?: 'mysql:host=localhost;dbname=customers',
        'user' => getenv('DB_USER') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
    ],
    'api' => [
        'base_url' => getenv('API_URL') ?: 'https://api.example.com',
        'key' => getenv('API_KEY'),
    ],
];
```

### Tools

```php title="src/Tools/CustomerTools.php"
<?php

namespace CustomerServer\Tools;

use Mcp\Capability\Attribute\McpTool;
use PDO;

class CustomerTools
{
    private PDO $db;

    public function __construct()
    {
        $config = require __DIR__ . '/../../config.php';
        $this->db = new PDO(
            $config['database']['dsn'],
            $config['database']['user'],
            $config['database']['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }

    #[McpTool(
        name: 'search_customers',
        description: 'Search for customers by name, email, or company'
    )]
    public function searchCustomers(
        ?string $name = null,
        ?string $email = null,
        ?string $company = null,
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

        if ($company !== null) {
            $conditions[] = 'company LIKE :company';
            $params['company'] = "%{$company}%";
        }

        $where = empty($conditions) ? '' : 'WHERE ' . implode(' AND ', $conditions);

        $sql = "SELECT id, name, email, company, created_at
                FROM customers {$where}
                ORDER BY created_at DESC
                LIMIT :limit";

        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':limit', min($limit, 100), PDO::PARAM_INT);

        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }

        $stmt->execute();

        return [
            'customers' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'count' => $stmt->rowCount(),
        ];
    }

    #[McpTool(
        name: 'get_customer',
        description: 'Get detailed information about a specific customer'
    )]
    public function getCustomer(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM customers WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);

        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$customer) {
            return null;
        }

        // Get related data
        $customer['orders'] = $this->getCustomerOrders($id);
        $customer['notes'] = $this->getCustomerNotes($id);

        return $customer;
    }

    #[McpTool(
        name: 'create_customer',
        description: 'Create a new customer record'
    )]
    public function createCustomer(
        string $name,
        string $email,
        ?string $company = null,
        ?string $phone = null
    ): array {
        // Validate email
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email address');
        }

        // Check for duplicate
        $stmt = $this->db->prepare('SELECT id FROM customers WHERE email = :email');
        $stmt->execute(['email' => $email]);

        if ($stmt->fetch()) {
            throw new \RuntimeException('Customer with this email already exists');
        }

        // Insert
        $stmt = $this->db->prepare(
            'INSERT INTO customers (name, email, company, phone, created_at)
             VALUES (:name, :email, :company, :phone, NOW())'
        );

        $stmt->execute([
            'name' => $name,
            'email' => $email,
            'company' => $company,
            'phone' => $phone,
        ]);

        $id = $this->db->lastInsertId();

        return [
            'success' => true,
            'id' => $id,
            'message' => "Customer created with ID {$id}",
        ];
    }

    #[McpTool(
        name: 'add_customer_note',
        description: 'Add a note to a customer record'
    )]
    public function addCustomerNote(
        int $customerId,
        string $note,
        ?string $category = 'general'
    ): array {
        // Verify customer exists
        $stmt = $this->db->prepare('SELECT id FROM customers WHERE id = :id');
        $stmt->execute(['id' => $customerId]);

        if (!$stmt->fetch()) {
            throw new \RuntimeException("Customer {$customerId} not found");
        }

        // Add note
        $stmt = $this->db->prepare(
            'INSERT INTO customer_notes (customer_id, note, category, created_at)
             VALUES (:customer_id, :note, :category, NOW())'
        );

        $stmt->execute([
            'customer_id' => $customerId,
            'note' => $note,
            'category' => $category,
        ]);

        return [
            'success' => true,
            'note_id' => $this->db->lastInsertId(),
        ];
    }

    private function getCustomerOrders(int $customerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, total, status, created_at
             FROM orders
             WHERE customer_id = :id
             ORDER BY created_at DESC
             LIMIT 10'
        );
        $stmt->execute(['id' => $customerId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function getCustomerNotes(int $customerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, note, category, created_at
             FROM customer_notes
             WHERE customer_id = :id
             ORDER BY created_at DESC'
        );
        $stmt->execute(['id' => $customerId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
```

### Resources

```php title="src/Resources/CustomerResources.php"
<?php

namespace CustomerServer\Resources;

use Mcp\Capability\Attribute\McpResource;
use PDO;

class CustomerResources
{
    private PDO $db;

    public function __construct()
    {
        // Initialize database connection
    }

    #[McpResource(
        uri: 'customers://stats',
        name: 'Customer Statistics',
        mimeType: 'application/json'
    )]
    public function getStats(): array
    {
        return [
            'total_customers' => $this->getTotalCustomers(),
            'new_this_month' => $this->getNewThisMonth(),
            'active_customers' => $this->getActiveCustomers(),
            'top_companies' => $this->getTopCompanies(),
        ];
    }

    #[McpResource(
        uri: 'customers://{id}/profile',
        name: 'Customer Profile',
        mimeType: 'application/json',
        isTemplate: true
    )]
    public function getProfile(int $id): array
    {
        $stmt = $this->db->prepare('SELECT * FROM customers WHERE id = :id');
        $stmt->execute(['id' => $id]);

        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$customer) {
            throw new \RuntimeException("Customer {$id} not found");
        }

        return $customer;
    }

    #[McpResource(
        uri: 'customers://schema',
        name: 'Database Schema',
        mimeType: 'application/json'
    )]
    public function getSchema(): array
    {
        return [
            'customers' => [
                'id' => 'int (primary key)',
                'name' => 'varchar(255)',
                'email' => 'varchar(255) unique',
                'company' => 'varchar(255) nullable',
                'phone' => 'varchar(50) nullable',
                'created_at' => 'datetime',
                'updated_at' => 'datetime',
            ],
            'customer_notes' => [
                'id' => 'int (primary key)',
                'customer_id' => 'int (foreign key)',
                'note' => 'text',
                'category' => 'varchar(50)',
                'created_at' => 'datetime',
            ],
            'orders' => [
                'id' => 'int (primary key)',
                'customer_id' => 'int (foreign key)',
                'total' => 'decimal(10,2)',
                'status' => 'varchar(50)',
                'created_at' => 'datetime',
            ],
        ];
    }

    private function getTotalCustomers(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM customers')->fetchColumn();
    }

    private function getNewThisMonth(): int
    {
        return (int) $this->db->query(
            'SELECT COUNT(*) FROM customers WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)'
        )->fetchColumn();
    }

    private function getActiveCustomers(): int
    {
        return (int) $this->db->query(
            'SELECT COUNT(DISTINCT customer_id) FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)'
        )->fetchColumn();
    }

    private function getTopCompanies(): array
    {
        return $this->db->query(
            'SELECT company, COUNT(*) as count FROM customers WHERE company IS NOT NULL GROUP BY company ORDER BY count DESC LIMIT 10'
        )->fetchAll(PDO::FETCH_ASSOC);
    }
}
```

### Prompts

```php title="src/Prompts/CustomerPrompts.php"
<?php

namespace CustomerServer\Prompts;

use Mcp\Capability\Attribute\McpPrompt;

class CustomerPrompts
{
    #[McpPrompt(
        name: 'customer_summary',
        description: 'Generate a summary of a customer relationship'
    )]
    public function customerSummary(int $customerId): array
    {
        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => <<<PROMPT
                    Please provide a comprehensive summary of customer #{$customerId}.

                    Use the following tools to gather information:
                    1. get_customer - Get basic customer info and recent orders
                    2. Check customer notes for any important history

                    Then provide:
                    - Customer overview (name, company, contact)
                    - Relationship history
                    - Recent activity
                    - Key notes or concerns
                    - Recommended next actions
                    PROMPT
                ]
            ]
        ];
    }

    #[McpPrompt(
        name: 'find_similar_customers',
        description: 'Find customers similar to a given customer'
    )]
    public function findSimilar(
        int $customerId,
        ?string $criteria = null
    ): array {
        $criteriaText = $criteria
            ? "Focus on similarity in: {$criteria}"
            : "Consider company size, industry, purchase patterns, and engagement";

        return [
            [
                'role' => 'user',
                'content' => [
                    'type' => 'text',
                    'text' => <<<PROMPT
                    Find customers similar to customer #{$customerId}.

                    {$criteriaText}

                    Steps:
                    1. Get details of customer #{$customerId}
                    2. Search for customers with similar attributes
                    3. Compare and rank by similarity

                    Provide a list of 5-10 similar customers with explanations.
                    PROMPT
                ]
            ]
        ];
    }
}
```

### Server Entry Point

```php title="server.php"
<?php

require_once __DIR__ . '/vendor/autoload.php';

use Mcp\Server;
use Mcp\Server\Transport\StdioTransport;

// Ensure clean stdout (no debug output)
ini_set('display_errors', '0');
ini_set('error_log', 'php://stderr');

$server = Server::builder()
    ->setServerInfo('Customer MCP Server', '1.0.0')
    ->setInstructions(<<<INSTRUCTIONS
    This server provides access to the customer database.

    Available capabilities:
    - Search and retrieve customer records
    - Create new customers
    - Add notes to customer records
    - View customer statistics

    Use search_customers to find customers before operating on them.
    INSTRUCTIONS)
    ->setDiscovery(__DIR__ . '/src', ['.'])
    ->build();

$transport = new StdioTransport();
$server->run($transport);
```

---

## Registering with Rea

### Configuration

```php title="config/mcp.php"
'servers' => [
    'customers' => [
        'transport' => 'stdio',
        'command' => 'php',
        'args' => ['/path/to/customer-mcp-server/server.php'],
        'env' => [
            'DB_DSN' => env('CUSTOMER_DB_DSN'),
            'DB_USER' => env('CUSTOMER_DB_USER'),
            'DB_PASSWORD' => env('CUSTOMER_DB_PASSWORD'),
        ],
    ],
],
```

### Usage

```
User: "Find all customers from Acme Corp"

Agent: Uses customers.search_customers with company="Acme Corp"
       Returns list of matching customers

User: "Add a note to customer #123 about our call today"

Agent: Uses customers.add_customer_note with customerId=123
       and note="Discussed renewal - customer interested"
```

---

## Best Practices

### 1. Descriptive Tool Names

```php
// Good
#[McpTool(name: 'search_customers')]
#[McpTool(name: 'get_customer_orders')]
#[McpTool(name: 'create_support_ticket')]

// Bad
#[McpTool(name: 'search')]
#[McpTool(name: 'get')]
#[McpTool(name: 'create')]
```

### 2. Comprehensive Descriptions

```php
#[McpTool(
    name: 'search_customers',
    description: 'Search for customers by name, email, or company. ' .
                 'Returns up to 10 results by default. ' .
                 'Use this before get_customer to find customer IDs.'
)]
```

### 3. Input Validation

```php
public function createCustomer(string $email): array
{
    // Validate
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new \InvalidArgumentException(
            "Invalid email format: {$email}"
        );
    }

    // Sanitize
    $email = strtolower(trim($email));

    // Process...
}
```

### 4. Error Handling

```php
public function getCustomer(int $id): array
{
    try {
        $customer = $this->repository->find($id);

        if ($customer === null) {
            return [
                'error' => "Customer {$id} not found",
                'suggestion' => 'Use search_customers to find valid IDs',
            ];
        }

        return $customer;

    } catch (\PDOException $e) {
        error_log("Database error: " . $e->getMessage());

        return [
            'error' => 'Database error occurred',
            'code' => 'DB_ERROR',
        ];
    }
}
```

### 5. Resource Organization

```php
// Logical URI scheme
'customers://stats'           // Aggregate data
'customers://{id}/profile'    // Individual record
'customers://{id}/orders'     // Related data
'customers://schema'          // Metadata
```

---

## Packaging for Distribution

### Composer Package

```json title="composer.json"
{
    "name": "mycompany/customer-mcp-server",
    "description": "MCP server for customer database",
    "type": "library",
    "require": {
        "php": "^8.1",
        "mcp/sdk": "^1.0"
    },
    "autoload": {
        "psr-4": {
            "MyCompany\\CustomerMCP\\": "src/"
        }
    },
    "bin": ["server.php"]
}
```

### Distribution

```bash
# Install globally
composer global require mycompany/customer-mcp-server

# Use in Rea
'command' => 'customer-mcp-server'
```

---

## Next Steps

- [PHP Server Implementation](../implementation/php-server.md) - Full server details
- [Security Reference](../reference/security.md) - Secure your server
- [API Reference](../reference/api.md) - Protocol reference
