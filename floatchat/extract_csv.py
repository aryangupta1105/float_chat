import psycopg2
import pandas as pd

# -------------------------------------
# Railway PostgreSQL Connection
# -------------------------------------
connection_string = (
    "dbname=railway "
    "user=postgres "
    "password=otCDcytskzYdQFdgvfWuVgwbpuLKqBbI "
    "host=yamabiko.proxy.rlwy.net "
    "port=44283 "
    "sslmode=require"
)

# -------------------------------------
# Query you want to export
# -------------------------------------
query = "SELECT * FROM ingest_files"  # change this to any query you want

# -------------------------------------
# Export Logic
# -------------------------------------
try:
    print("⏳ Connecting to database...")
    conn = psycopg2.connect(connection_string)

    print("📥 Running query...")
    df = pd.read_sql(query, conn)

    if df.empty:
        print("⚠ No rows returned by query.")
    else:
        print(f"📊 Rows fetched: {len(df)}")

        # Save to CSV
        output_file = "ingest_files_export.csv"
        df.to_csv(output_file, index=False)

        print(f"✅ Export complete → {output_file}")

    conn.close()
    print("🔌 Connection closed.")

except Exception as e:
    print(f"❌ Error: {e}")
