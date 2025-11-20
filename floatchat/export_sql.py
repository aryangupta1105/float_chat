import subprocess
import getpass

pg_dump_path = r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

output_file = r"C:\Users\aarya\sih\floatchat\railway_backup.sql"

host = "yamabiko.proxy.rlwy.net"
port = "44283"
user = "postgres"
dbname = "railway"
password = "otCDcytskzYdQFdgvfWuVgwbpuLKqBbI"   # or ask user for input

command = [
    pg_dump_path,
    f"--file={output_file}",
    f"--host={host}",
    f"--port={port}",
    f"--username={user}",
    "--format=plain",
    "--verbose",
    dbname
]

# IMPORTANT: provide password through environment variable
env = {
    **subprocess.os.environ,
    "PGPASSWORD": password
}

print("⏳ Running pg_dump...")
result = subprocess.run(command, env=env, text=True, capture_output=True)

if result.returncode == 0:
    print(f"✅ Dump created: {output_file}")
else:
    print("❌ Error:")
    print(result.stderr)
