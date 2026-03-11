# Future Iterations

Living document tracking planned improvements and future tool additions for Ally.

## Custom Tool Roadmap

### Implemented

| Tool | Description | Status |
|------|-------------|--------|
| `web_search` | Claude server-side web search for real-time information | Done |
| `remember_fact` | Explicitly save important facts to long-term memory | Done |
| `recall_memory` | Search memory store for user facts | Done |
| `set_reminder` | Create follow-up reminders for upcoming events or unresolved topics | Done |

### Planned — High Priority

| Tool | Description | Effort |
|------|-------------|--------|
| `check_calendar` | Read user's calendar events (Google Calendar / Apple Calendar integration) | Medium — requires OAuth flow |
| `create_calendar_event` | Create events from natural language ("remind me about dentist Tuesday 3pm") | Medium — depends on calendar integration |
| `get_weather` | Local weather via user's location (useful for daily briefings and small talk) | Small — simple API call |
| `web_fetch` | Fetch and summarize a specific URL the user shares | Small — Claude has built-in `web_fetch` tool |
| `search_contacts` | Look up info about people in the user's life from memory graph | Medium — depends on entity graph |

### Planned — Medium Priority

| Tool | Description | Effort |
|------|-------------|--------|
| `mood_log` | Log the user's current mood with optional context for trend tracking | Small |
| `goal_update` | Update progress on an active goal | Small |
| `generate_summary` | Summarize recent conversations on demand ("what did we talk about this week?") | Medium |
| `spotify_now_playing` | Know what the user is listening to for context-aware conversation | Medium — requires Spotify OAuth |
| `location_aware` | Use device location for contextual suggestions (nearby restaurants, weather) | Medium — requires mobile permissions |

### Planned — Low Priority / Exploratory

| Tool | Description | Effort |
|------|-------------|--------|
| `send_message` | Send a message to someone on the user's behalf (SMS/WhatsApp integration) | Large — complex integrations |
| `task_manager` | Create/update tasks in external task managers (Todoist, Things, Reminders) | Medium |
| `health_data` | Read Apple Health / Google Fit data for wellness-aware conversations | Large — native module needed |
| `journal_entry` | Create structured journal entries from conversation | Small |
| `photo_context` | Analyze photos the user shares for richer context | Medium — multimodal API |

## Architecture Improvements

### Memory System

- **Graph-based retrieval**: Move from flat pgvector to entity relationship graph (Neo4j or in-Postgres adjacency). Enables multi-hop queries like "What did I say about Mom's doctor?"
- **Memory consolidation**: Periodically merge/deduplicate similar facts. Detect when newer facts supersede older ones.
- **Memory decay**: Automatically reduce importance of facts that haven't been accessed in months.
- **Contradiction detection**: When a new fact contradicts an existing one, flag for resolution.

### Proactivity

- **Context signals from device**: Battery level, time of day, location changes, screen time.
- **Mood prediction**: Use conversation patterns to predict mood shifts before the user articulates them.
- **Smart notification timing**: Learn when the user is most receptive to messages (not just a fixed daily ping time).

### Conversation Quality

- **Fine-tuning pipeline**: Collect rated conversations, train on high-rated examples.
- **A/B testing framework**: Test prompt variations and measure user engagement.
- **Voice mode**: Real-time voice conversations via LiveKit or similar.

### Infrastructure

- **Redis for memory queue**: Replace in-process queue with Redis + BullMQ when scaling to multiple instances.
- **Event sourcing**: Store all state changes as events for replay and debugging.
- **Analytics pipeline**: Track conversation quality metrics, memory accuracy, tool usage patterns.
