# Automated Multi-Server Health Auditing & AI Alerting Pipeline (n8n)

An automated infrastructure observability pipeline built with **self-hosted n8n**, **Bash/Cron agents**, **OpenAI LLMs**, and **Telegram**. The system collects raw diagnostic telemetry across Linux servers and MikroTik edge routers, analyzes anomalies using an LLM, and dispatches clean, collapsible HTML health reports and executive rollup summaries to a team Telegram channel.

---

## 🎯 The Problem

Managing a growing fleet of production servers (web hosts, MongoDB clusters, PostgreSQL/MariaDB databases, Redis/RabbitMQ brokers, and MikroTik edge routers) traditionally requires engineers to manually SSH into each node to inspect `uptime`, `df -h`, `free -h`, `ps aux`, and `fail2ban` logs.

This manual process introduces several operational bottlenecks:
* **Time-Consuming Routine Checks:** Daily manual audits across 11+ servers consume significant engineering overhead and are prone to human oversight.
* **Raw Log Noise:** Native CLI outputs are verbose and difficult to scan quickly on mobile devices during incident response.
* **Alert Fatigue & Chat Clutter:** Sending verbose, multi-page diagnostic dumps for every server floods team communication channels.
* **Firewall & NAT Constraints:** Direct SSH polling from a central orchestrator fails when target nodes sit behind strict NAT, dynamic IPs, or restrictive inbound firewall rules.

**The Solution:** This repository implements **two complementary n8n architectures**—an **SSH Pull Model** for tightly coupled host + edge-router correlation, and a **Decoupled Webhook Push Model** backed by an n8n Data Table queue for scalable multi-server fleets.

---

## 🏗️ System Design & Workflow Architectures

### Architecture Comparison

| Feature | Version 1: SSH Pull Pipeline | Version 2: Webhook Push Pipeline |
| :--- | :--- | :--- |
| **Collection Model** | Central n8n pulls telemetry via SSH | Target hosts push JSON payloads via `curl` + `cron` |
| **Network Requirement** | Inbound SSH access from n8n to targets | Outbound HTTPS (`POST`) only from targets to n8n |
| **State & Persistence** | Stateless (in-memory execution) | Stateful queue via n8n Data Table (`server_audits`) |
| **Scalability** | Best for 1–3 tightly paired nodes | Scales cleanly to 10–50+ heterogeneous servers |
| **Failure Isolation** | Single execution batch | Per-item loop isolation + dedicated Error Workflow |
| **Reporting Output** | Unified combined report | Per-server expandable cards + fleet rollup dashboard |

---

### 1. SSH Pull Version (Host + Edge Router Correlation)

Designed for tightly coupled infrastructure where a Linux application server and its perimeter MikroTik router must be evaluated together in a single correlated report.

#### Data Flow
```text
                        ┌──► [Website-Monitor (SSH)] ──┐
[Schedule Trigger] ─────┤                              ├──► [Merge (Combine)] ──► [Basic LLM Chain] ──► [Code in JavaScript] ──► [Telegram Alert]
                        └──► [Mikrotik-Monitor (SSH)] ─┘                              ▲
                                                                                      │
                                                                            [OpenAI Chat Model]
```

#### Step-by-Step Execution
1. **Scheduled Trigger:** Fires daily at a configured interval (`Asia/Tehran` timezone).
2. **Parallel SSH Execution:** Simultaneously executes diagnostic commands on the Linux host (`Website-Monitor`) and perimeter router (`Mikrotik-Monitor`).
3. **Stream Synchronization (`Merge`):** Waits for both SSH branches to complete and combines their stdout payloads into a single unified JSON object.
4. **AI Synthesis (`Basic LLM Chain` + `OpenAI Chat Model`):** Evaluates CPU/RAM thresholds, disk utilization, PHP-FPM workers, Fail2ban jails, and MikroTik WAN firewall drops, formatting the findings into structured Telegram HTML.
5. **HTML Sanitization (`Code in JavaScript`):** Validates and auto-closes HTML tags to prevent Telegram API `400 Bad Request` entity parsing errors.
6. **Dispatch (`Telegram`):** Posts the unified infrastructure audit to the operations group.

#### Nodes Used (SSH Version)
* **Schedule Trigger:** Cron-based workflow initiation.
* **SSH (`Website-Monitor` / `Mikrotik-Monitor`):** Remote command execution over SSH.
* **Merge:** Combines multi-branch execution streams (`Combine` mode).
* **Basic LLM Chain & OpenAI Chat Model:** Structured prompt execution and telemetry analysis.
* **Code Node (`Code in JavaScript`):** Regex/stack tag validation and chat ID routing.
* **Telegram (`Send a text message`):** Final HTML message delivery.

---

### 2. Webhook Push Version (Decoupled Fleet Monitoring + Rollup)

Designed for horizontal scalability across 11+ production nodes (`postgresql`, `mariadb`, `mongo_100k`, `mongo_80k`, `mongo_60k`, `mongo_40k`, `mongo_20k`, `redis_rabbitMQ`, `micro service`, `website-server`, `monitoring_server`). It decouples **data ingestion** from **LLM processing and alerting**.

#### Stage A: Host Agent & Webhook Ingestion (`webhook-workflow`)

Each monitored server runs a lightweight Bash script (`report_webhook.sh`) via `cron` that gathers system metrics and pushes a JSON payload to n8n.

```text
[Linux Server Cron] ──(POST JSON)──► [Webhook Node] ──► [Insert row (server_audits Data Table)]
```

* **Data Table Schema (`server_audits`):**
  * `id` *(Number, Auto-increment)*: Primary key for row-level state updates.
  * `server_id` *(String)*: Unique host identifier (e.g., `postgresql`, `mongo_100k`).
  * `audit_data` *(String)*: Raw system health telemetry dump.
  * `is_sent` *(Boolean)*: Processing state flag (`false` on insert, updated to `true` after Telegram dispatch).
  * `createdAt` / `updatedAt` *(Timestamp)*: Ingestion and dispatch audit timestamps.

#### Stage B: Iterative Processing, Alerting & Rollup (`Server monitoring webhook`)

```text
[Schedule Trigger] ──► [Get row(s): is_sent=false] ──► [Gathering Rows (Code)] ──► [Loop Over Items1]
                                                                                      │           │
                                                                         ┌───(loop)───┘           └───(done)───┐
                                                                         ▼                                     ▼
                                                                [Basic LLM Chain]                    [Build Rollup Summary]
                                                                         │                                     │
                                                                         ▼                                     ▼
                                                                [Code in JavaScript]                 [Send a text message2]
                                                                (HTML Stack Sanitizer)                (Fleet Status Dashboard)
                                                                         │
                                                                         ▼
                                                                [Send a text message]
                                                                 (Per-Server Alert)
                                                                         │
                                                                         ▼
                                                                [Update row(s): is_sent=true] ──(next item)──┘
```

1. **Queue Fetch (`Get row(s)`):** Queries `server_audits` for all pending records where `is_sent = false`.
2. **Pre-Processing & Guardrails (`Gathering Rows`):** Validates payload integrity, injects missing-telemetry warnings if a host sent empty data, and truncates oversized log dumps (`> 4,000` chars) to prevent LLM API timeouts.
3. **Progressive Item Loop (`Loop Over Items1`):** Processes servers one by one (`Batch Size: 1`). If an API timeout occurs on server #8, servers #1–#7 are already delivered and marked `is_sent = true`.
4. **LLM Analysis (`Basic LLM Chain` + `OpenAI Chat Model`):** Generates a concise status header (`🟢`/`🟡`/`🔴`) and wraps detailed metrics inside a `<blockquote expandable>` tag so messages appear compact in Telegram until tapped.
5. **Stack-Based HTML Sanitizer (`Code in JavaScript`):** Runs a LIFO tag parser that escapes stray `<` characters (such as `<defunct>` processes from `ps aux`), strips unmatched closing tags, and balances nested `<b>`, `<i>`, `<code>`, and `<blockquote expandable>` tags.
6. **Alert & State Commit (`Send a text message` → `Update row(s)`):** Routes successful Telegram deliveries (`Success` output branch) to update the database row (`is_sent = true`), leaving failed items (`Error` output branch) queued for retry.
7. **Executive Fleet Summary (`done` Branch → `Build Rollup Summary` → `Send a text message2`):** Once all loop iterations complete, aggregates status headers across all loop runs (`runIndex`) and posts a single consolidated dashboard message showing total servers audited, healthy count, and alerts.

#### Stage C: Error Compensation Workflow (`compensation`)

```text
[Error Trigger] ──► [If (Node Filter)] ──► [Send a text message (Plain-Text Incident Alert)]
```

* Captures unhandled production workflow exceptions and notifies administrators with the exact failed node name, workflow name, execution ID, and error trace.

#### Nodes Used (Webhook Version)
* **Webhook:** HTTP `POST` endpoint receiving JSON telemetry from remote servers.
* **Data Table (`Insert row` / `Get row(s)` / `Update row(s)`):** Built-in persistent storage acting as a reliable message queue.
* **Schedule Trigger:** Triggers scheduled batch processing.
* **Loop Over Items (`Split In Batches`):** Iterates through pending server rows sequentially and provides a `done` trigger for post-loop aggregation.
* **Code Node (`Gathering Rows`, `Code in JavaScript`, `Build Rollup Summary`):** Payload truncation, stack-based HTML sanitization, and cross-iteration rollup aggregation.
* **Basic LLM Chain & OpenAI Chat Model:** Automated log analysis and HTML report generation.
* **Telegram (`Send a text message` / `Send a text message2`):** Dispatches individual expandable cards and the final summary dashboard with `Continue (using error output)` enabled.
* **Error Trigger & If Node:** Out-of-band failure monitoring and incident alerting.

---

## 🛡️ Key Reliability & Engineering Features

* **Collapsible Telegram UI (`<blockquote expandable>`):** Keeps the team chat clean by displaying only the server status header and 2-sentence overview by default, expanding full resource metrics on click.
* **Zero-Crash HTML Stack Sanitizer:** Raw Linux outputs frequently contain angle brackets (e.g., `<defunct>`, `<none>`) that crash Telegram's HTML parser. A custom JavaScript stack parser escapes non-whitelisted tags and enforces strict tag nesting before dispatch.
* **Empty-Payload Guardrails:** Prevents the LLM from hallucinating or returning conversational filler if a remote cron script fails and submits an empty string.
* **Fault-Tolerant Branching:** Separating Telegram's `Success` and `Error` outputs ensures failed notifications never falsely mark database records as `is_sent = true`.

---

## 🚀 Setup & Deployment

### 1. Import n8n Workflows
1. Open your self-hosted n8n instance and import the workflow `.json` files from this repository:
   * `webhook-workflow.json` (Ingestion)
   * `server-monitoring-webhook.json` (Processing, Loop & Rollup)
   * `compensation.json` (Error Handling)
   * *(Optional)* `ssh-monitoring-workflow.json` (Direct SSH Pull Version)
2. Create an **n8n Data Table** named `server_audits` with columns: `server_id` (String), `audit_data` (String), and `is_sent` (Boolean).
3. Configure your **OpenAI API** and **Telegram Bot** credentials in the respective nodes, update `chatIds` in the Code nodes, and **Publish** the workflows.

### 2. Deploy the Host Agent (`report_webhook.sh`)
On each Linux server you want to monitor:

```bash
# 1. Copy the script to the server and set permissions
chmod +x /home/user/report_webhook.sh

# 2. Edit SERVER_ID and WEBHOOK_URL inside report_webhook.sh
# SERVER_ID="web-server-01"
# WEBHOOK_URL="[https://your-n8n-domain.com/webhook/server-audit](https://your-n8n-domain.com/webhook/server-audit)"

# 3. Schedule daily execution via crontab -e
0 8 * * * /bin/bash /home/user/report_webhook.sh >> /home/user/cron_webhook.log 2>&1
```
