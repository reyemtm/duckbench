# DuckDB vs SQLite Performance Comparison

A performance testing suite comparing DuckDB and SQLite for analytical queries on 10 million order records.

## Quick Start

### 1. Generate Test Data (10 million records)
```bash
node generate-data.js
```
This creates CSV files with:
- 100,000 customers
- 10,000 products
- 10,000,000 orders

### 2. Initialize Databases
```bash
node init-databases.js
```
This loads the data into both SQLite and DuckDB databases.

### 3. Start the Server
```bash
node server.js
```
The dashboard will be available at http://localhost:3023

## What It Tests

The benchmark runs 6 complex analytical queries with multiple joins and aggregations:

1. **Total Revenue by Country** - Aggregates orders by customer country
2. **Top Products by Category** - Multi-level grouping with product data
3. **Monthly Sales Trends** - Time-based aggregation with distinct counts
4. **Customer Lifetime Value** - Subquery with customer-level metrics
5. **Category Performance Analysis** - Comprehensive category analytics
6. **Complex Multi-Join Aggregation** - Heavy join with multiple GROUP BY and HAVING clauses

## Expected Results

Based on the hypothesis, DuckDB should show:
- Query latency reduction from seconds to milliseconds
- Significant speedup (10x-100x) for analytical queries
- Sub-10ms dashboard load times vs 8+ seconds for SQLite

## API Endpoints

- `GET /api/benchmark?db=sqlite` - Run SQLite benchmarks
- `GET /api/benchmark?db=duckdb` - Run DuckDB benchmarks
- `GET /api/stats` - Get database statistics

## Dependencies

- express - Web server
- duckdb - DuckDB database driver
- better-sqlite3 - SQLite database driver
