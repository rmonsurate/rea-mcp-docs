# API Reference

Complete API reference for MCP integration in Rea.

## Protocol Messages

MCP uses JSON-RPC 2.0 for all communication.

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {"query": "test"}
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {"type": "text", "text": "..."}
    ]
  }
}
```

### Error Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": {}
  }
}
```

---

## Lifecycle Methods

### initialize

Establishes connection and negotiates capabilities.

**Request:**
```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {"listChanged": true}
    },
    "clientInfo": {
      "name": "rea-mcp-client",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
```json
{
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {"listChanged": true},
      "resources": {"subscribe": true},
      "prompts": {}
    },
    "serverInfo": {
      "name": "notion-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

### notifications/initialized

Sent by client after successful initialization.

```json
{
  "method": "notifications/initialized"
}
```

---

## Tool Methods

### tools/list

List available tools.

**Request:**
```json
{
  "method": "tools/list"
}
```

**Response:**
```json
{
  "result": {
    "tools": [
      {
        "name": "search",
        "description": "Search for pages",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {"type": "string"}
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

### tools/call

Execute a tool.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "meeting notes"
    }
  }
}
```

**Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"results\": [...]}"
      }
    ],
    "isError": false
  }
}
```

**Content Types:**

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `text` | Plain text content |
| `image` | `data`, `mimeType` | Base64-encoded image |
| `resource` | `resource` | Embedded resource |

---

## Resource Methods

### resources/list

List available resources.

**Request:**
```json
{
  "method": "resources/list"
}
```

**Response:**
```json
{
  "result": {
    "resources": [
      {
        "uri": "notion://workspace/info",
        "name": "Workspace Info",
        "mimeType": "application/json"
      }
    ]
  }
}
```

### resources/read

Read a resource.

**Request:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "notion://workspace/info"
  }
}
```

**Response:**
```json
{
  "result": {
    "contents": [
      {
        "uri": "notion://workspace/info",
        "mimeType": "application/json",
        "text": "{\"name\": \"My Workspace\"}"
      }
    ]
  }
}
```

### resources/subscribe

Subscribe to resource changes.

**Request:**
```json
{
  "method": "resources/subscribe",
  "params": {
    "uri": "notion://pages/abc123"
  }
}
```

---

## Prompt Methods

### prompts/list

List available prompts.

**Request:**
```json
{
  "method": "prompts/list"
}
```

**Response:**
```json
{
  "result": {
    "prompts": [
      {
        "name": "code_review",
        "description": "Review code for issues",
        "arguments": [
          {
            "name": "code",
            "description": "Code to review",
            "required": true
          }
        ]
      }
    ]
  }
}
```

### prompts/get

Get a prompt with arguments.

**Request:**
```json
{
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "code": "function add(a, b) { return a + b; }"
    }
  }
}
```

**Response:**
```json
{
  "result": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Please review this code..."
        }
      }
    ]
  }
}
```

---

## Notifications

### notifications/tools/list_changed

Server notifies client when tools change.

```json
{
  "method": "notifications/tools/list_changed"
}
```

### notifications/resources/list_changed

Server notifies client when resources change.

```json
{
  "method": "notifications/resources/list_changed"
}
```

### notifications/resources/updated

Server notifies client when a subscribed resource updates.

```json
{
  "method": "notifications/resources/updated",
  "params": {
    "uri": "notion://pages/abc123"
  }
}
```

---

## Rea REST API

### Connections

#### List Connections

```
GET /api/mcp/connections
```

**Response:**
```json
{
  "connections": [
    {
      "id": 1,
      "name": "notion",
      "server_type": "notion",
      "enabled": true,
      "last_connected_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Create Connection

```
POST /api/mcp/connections
```

**Body:**
```json
{
  "name": "notion",
  "server_type": "notion",
  "credentials": {
    "token": "ntn_..."
  }
}
```

#### Test Connection

```
POST /api/mcp/connections/{id}/test
```

**Response:**
```json
{
  "success": true,
  "tools_count": 12,
  "server_info": {
    "name": "notion-mcp-server",
    "version": "1.0.0"
  }
}
```

#### Delete Connection

```
DELETE /api/mcp/connections/{id}
```

### Tools

#### List Tools

```
GET /api/mcp/tools
```

**Response:**
```json
{
  "tools": [
    {
      "fullName": "notion.search",
      "name": "search",
      "description": "Search for pages and databases",
      "connection": "notion",
      "inputSchema": {...}
    }
  ]
}
```

#### Call Tool

```
POST /api/mcp/tools/call
```

**Body:**
```json
{
  "tool": "notion.search",
  "arguments": {
    "query": "meeting notes"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "content": [...]
  }
}
```

### Chat

#### Send Message

```
POST /api/agent/chat
```

**Body:**
```json
{
  "message": "Search my Notion for meeting notes"
}
```

**Response:**
```json
{
  "message": "I found 3 meeting notes in your Notion workspace...",
  "tools_used": ["notion.search"]
}
```

---

## Error Codes

### JSON-RPC Errors

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Not a valid request object |
| -32601 | Method not found | Unknown method |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal server error |

### MCP Errors

| Code | Message | Description |
|------|---------|-------------|
| -32001 | Connection failed | Failed to connect to server |
| -32002 | Timeout | Request timed out |
| -32003 | Tool not found | Unknown tool name |
| -32004 | Resource not found | Unknown resource URI |
| -32005 | Unauthorized | Missing or invalid credentials |

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

---

## PHP SDK Classes

### MCPClientInterface

```php
interface MCPClientInterface
{
    public function connect(): void;
    public function isConnected(): bool;
    public function getServerInfo(): array;
    public function getCapabilities(): array;
    public function listTools(): array;
    public function callTool(string $name, array $arguments = []): array;
    public function listResources(): array;
    public function readResource(string $uri): array;
    public function listPrompts(): array;
    public function getPrompt(string $name, array $arguments = []): array;
    public function disconnect(): void;
}
```

### MCPManagerService

```php
class MCPManagerService
{
    public function getClient(User $user, string $connectionName): MCPClientInterface;
    public function getAllTools(User $user): array;
    public function callTool(User $user, string $fullName, array $arguments): array;
    public function disconnectUser(User $user): void;
    public function disconnectAll(): void;
}
```

### Tool Attributes

```php
#[McpTool(
    name: 'tool_name',
    description: 'Tool description'
)]
public function toolMethod(string $arg1, ?int $arg2 = null): array;
```

### Resource Attributes

```php
#[McpResource(
    uri: 'resource://path',
    name: 'Resource Name',
    mimeType: 'application/json',
    isTemplate: false
)]
public function resourceMethod(): array;
```

### Prompt Attributes

```php
#[McpPrompt(
    name: 'prompt_name',
    description: 'Prompt description'
)]
public function promptMethod(string $arg): array;
```

---

## Next Steps

- [Configuration Reference](configuration.md)
- [Security Reference](security.md)
- [Notion Tutorial](../tutorials/notion-mcp.md)
