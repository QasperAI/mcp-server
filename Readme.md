# @qasperai/mcp-server

MCP server for [Qasper](https://qasper.ai) — discover and book local service businesses (barbers, dentists, plumbers, hair salons, mechanics, and more) directly from any MCP-compatible AI assistant.

This package is a thin stdio shim that proxies to Qasper's hosted MCP server at `https://qasper.ai/mcp`. All tool definitions are pulled live from the upstream so this package never goes out of date.

## Tools

- `SearchBusinesses` — find local businesses by category and location (text or lat/lng).
- `GetBusinessInfo` — name, hours, languages, contact info.
- `GetServices` — service catalog with durations and price ranges.
- `GetPricing` — quote a service with emergency / weekend modifiers.
- `CheckAvailability` — open slots from the business's calendar.
- `BookAppointment` — create a confirmed booking.
- `SendInquiry` — send a free-form question or quote request.

## Install

### Remote (HTTP)

The server is hosted at `https://qasper.ai/mcp` and can be used directly by any MCP client that supports remote (HTTP) servers — no install required:

```json
{
  "mcpServers": {
    "qasper": {
      "url": "https://qasper.ai/mcp"
    }
  }
}
```

### Claude Desktop (stdio)

For clients that only support stdio, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qasper": {
      "command": "npx",
      "args": ["-y", "@qasper/mcp-server"]
    }
  }
}
```

### Cursor / other MCP clients

```bash
npx -y @qasper/mcp-server
```

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `QASPER_MCP_URL` | `https://qasper.ai/mcp` | Upstream MCP endpoint. |

## License

MIT