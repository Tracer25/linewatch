CREATE DATABASE IF NOT EXISTS linewatch;

CREATE TABLE IF NOT EXISTS linewatch.alerts
(
    ingest_time DateTime DEFAULT now(),
    ts DateTime,
    agent_id String,
    rule_name String,
    severity Int32,
    source_file String,
    original_log_line String
)
ENGINE = MergeTree
ORDER BY (ts, agent_id, rule_name);

CREATE TABLE IF NOT EXISTS linewatch.kafka_alerts_raw
(
    agent_id String,
    ts String,
    rule String,
    severity Int32,
    src String,
    line String
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'alerts.raw',
    kafka_group_name = 'linewatch_clickhouse',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS linewatch.mv_alerts_to_merge_tree
TO linewatch.alerts
AS
SELECT
    now() AS ingest_time,
    parseDateTimeBestEffortOrNull(ts) AS ts,
    agent_id,
    rule AS rule_name,
    severity,
    src AS source_file,
    line AS original_log_line
FROM linewatch.kafka_alerts_raw;
