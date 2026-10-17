# Linewatch

Linewatch is a lightweight intrusion-detection pipeline built with C++ agents and a central C++ server.

- Agents tail log files, apply lightweight detection rules, and emit alerts as newline-delimited JSON over TCP.
- The server accepts alerts from many agents, validates and aggregates them, exposes Prometheus metrics, and optionally publishes alerts to Kafka.
- The included Docker stack wires Kafka (Redpanda), ClickHouse, Prometheus, Grafana, and OpenTelemetry Collector for ingestion and dashboards.

## Repository Structure

- `common/agent` - Log tailing agent (`agent`) that detects suspicious lines and sends alerts.
- `common/server` - TCP server (`server`) that receives alerts, aggregates counters, exports metrics, and publishes to Kafka.
- `common/alert.*` - Shared alert model and JSON serialization/parsing.
- `infra/` - ClickHouse schema, Prometheus config, OTel collector config, and Grafana provisioning.
- `scripts/` - Convenience scripts for bringing the stack up/down and sending a sample alert.
- `common/mortgage_rag` - Separate Python RAG demo app, unrelated to the alert pipeline.

## Alert Format (NDJSON over TCP)

Each alert is sent as one JSON object per line:

```json
{"agent_id":"web-01","ts":"2026-03-01T12:00:00Z","rule":"SSH_FAILED_PASSWORD","severity":3,"src":"/var/log/auth.log","line":"Failed password for root from 10.0.0.2"}
```

Required fields for server validity checks:
- `agent_id`
- `rule`

## Detection Rules (Current)

Implemented in `common/agent/detector.cpp`:

- `SSH_FAILED_PASSWORD` (severity `3`) when line contains `Failed password`
- `SUDO_USED` (severity `2`) when line contains `sudo`
- `WEB_SCAN` (severity `4`) when line contains `../` or `wp-admin`

## Quick Start: Full Observability Stack (Docker)

Prerequisites:
- Docker + Docker Compose

1. Start everything:
```bash
./scripts/stack-up.sh
```

2. Send a sample alert:
```bash
./scripts/send-sample-alert.sh
```

3. Verify server metrics:
```bash
curl -s http://localhost:9464/metrics
```

4. Verify ClickHouse ingestion:
```bash
curl -s 'http://localhost:8123/?query=SELECT%20count()%20FROM%20linewatch.alerts'
```

5. Open UIs:
- Grafana: `http://localhost:3001` (`admin/admin`)
- Prometheus: `http://localhost:9090`

Stop stack:
```bash
./scripts/stack-down.sh
```

## Run Locally Without Docker

### Open the Linewatch Console

The local customer-facing prototype uses only Python's standard library and runs without Docker. Start the C++ server in one terminal:

```bash
./common/server/server
```

Then start the web console in another:

```bash
python3 scripts/web-app.py
```

Open `http://127.0.0.1:8000`. The inbox and server inventory are illustrative sample data; the connection status and counters are read live from the local server's metrics endpoint at `127.0.0.1:9464`. The console does not store alerts received by the C++ server.

For a safe end-to-end demo, create a regular text file, start the agent against it, then append synthetic log lines:

```bash
touch /tmp/linewatch-demo.log
./common/agent/agent demo /tmp/linewatch-demo.log 127.0.0.1 9000
echo 'Failed password for demo from 192.0.2.10' >> /tmp/linewatch-demo.log
```

Stop each process with `Ctrl-C`. Do not point the demo at production or personal logs: matching lines are forwarded in full. This prototype has no login, secure agent enrollment, or tenant isolation; keep it local.

### 1. Build binaries

```bash
cd common/server && make
cd ../agent && make
```

### 2. Run server

From `common/server`:

```bash
./server [port] [summary_interval_seconds] [metrics_port]
```

Defaults:
- `port=9000`
- `summary_interval_seconds=10`
- `metrics_port=9464`

Kafka output is optional and controlled by env vars:
- `KAFKA_BROKERS` (example: `127.0.0.1:9092`)
- `KAFKA_TOPIC` (default: `alerts.raw`)

### 3. Run agent

From `common/agent`:

```bash
./agent <agent_id> <log_file> [server_ip] [port]
```

Example:

```bash
./agent web-01 /var/log/auth.log 127.0.0.1 9000
```

The agent polls for new log lines every 100ms and retries server connection on send failure.

## Metrics Exposed by Server

On `GET /metrics`:
- `linewatch_server_connections_total`
- `linewatch_server_disconnections_total`
- `linewatch_server_alerts_received_total`
- `linewatch_server_alerts_malformed_total`
- `linewatch_server_alerts_published_total`
- `linewatch_server_alerts_publish_failed_total`

## ClickHouse Pipeline

`infra/clickhouse/init.sql` creates:
- `linewatch.kafka_alerts_raw` (Kafka engine source from `alerts.raw`)
- `linewatch.mv_alerts_to_merge_tree` (materialized view transform)
- `linewatch.alerts` (MergeTree analytics table)

Example query:

```sql
SELECT rule_name, count() AS c
FROM linewatch.alerts
GROUP BY rule_name
ORDER BY c DESC;
```

## Notes

- The server also prints periodic in-memory summaries (by rule, agent, severity).
- The root project contains the Linewatch (C++) alert pipeline and a separate `common/mortgage_rag` Python demo.
