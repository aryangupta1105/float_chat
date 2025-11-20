#!/usr/bin/env python3

import os
import json
import hashlib
import shutil
from pathlib import Path
import xarray as xr
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# ---------------- CONFIG ----------------
SOURCE_DIR = Path("ingestion/source_files")
PROCESSED_DIR = Path("ingestion/processed")
LOG_DIR = Path("ingestion/logs")
PARQUET_DIR = Path("ingestion/parquet")

for d in [PROCESSED_DIR, LOG_DIR, PARQUET_DIR]:
    d.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

TABLE_PROFILES = "profiles"
TABLE_SUMMARIES = "profile_summaries"
TABLE_INGEST = "ingest_files"

# ---------------- FILE CHECKSUM ----------------
def compute_sha256(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

def file_already_processed(filename, sha256):
    with engine.connect() as conn:
        q = conn.execute(
            text(f"SELECT 1 FROM {TABLE_INGEST} WHERE filename = :fn AND sha256 = :sha"),
            {"fn": filename, "sha": sha256}
        ).fetchone()
        return q is not None

def mark_processed(filename, sha256, rows):
    with engine.begin() as conn:
        conn.execute(text(f"""
            INSERT INTO {TABLE_INGEST} (filename, sha256, rows_inserted)
            VALUES (:fn, :sha, :rows)
            ON CONFLICT (filename)
            DO UPDATE SET sha256 = EXCLUDED.sha256, rows_inserted = EXCLUDED.rows_inserted;
        """), {"fn": filename, "sha": sha256, "rows": rows})

# ---------------- CREATE TABLES ----------------
def create_tables():
    with engine.begin() as conn:
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_PROFILES} (
                id BIGSERIAL PRIMARY KEY,
                float_id TEXT,
                profile_index INTEGER,
                cycle INTEGER,
                time TIMESTAMPTZ,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                depth REAL,
                temperature REAL,
                salinity REAL,
                qc TEXT,
                source_file TEXT,
                raw_metadata JSONB
            );
        """))

        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_SUMMARIES} (
                id BIGSERIAL PRIMARY KEY,
                profile_key TEXT UNIQUE,
                float_id TEXT,
                time TIMESTAMPTZ,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                n_levels INTEGER,
                min_depth REAL,
                max_depth REAL,
                mean_temperature REAL,
                mean_salinity REAL,
                temp_surface REAL,
                sal_surface REAL,
                variables TEXT[],
                raw_metadata JSONB
            );
        """))

        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {TABLE_INGEST} (
                filename TEXT PRIMARY KEY,
                sha256 TEXT,
                processed_at TIMESTAMPTZ DEFAULT NOW(),
                rows_inserted INTEGER
            );
        """))

    print("✅ Tables ready (duplicate-safe)")

# ---------------- SAFE TIME PARSER ----------------
def parse_juld(juld_raw):
    if pd.api.types.is_numeric_dtype(juld_raw):
        return pd.to_datetime(juld_raw, unit="D", origin=pd.Timestamp("1950-01-01"))

    try:
        return pd.to_datetime(juld_raw)
    except:
        return pd.to_datetime(juld_raw.astype(str))

# ---------------- NETCDF PARSER ----------------
def extract_profiles(ds, filename):
    PRES = ds["PRES"].values
    TEMP = ds["TEMP"].values
    PSAL = ds["PSAL"].values

    if PRES.ndim == 2:
        N_PROF, N_LEVEL = PRES.shape
    else:
        N_PROF, N_LEVEL = 1, len(PRES)
        PRES = PRES.reshape((1, N_LEVEL))
        TEMP = TEMP.reshape((1, N_LEVEL))
        PSAL = PSAL.reshape((1, N_LEVEL))

    float_ids = ds["PLATFORM_NUMBER"].values
    lats = ds["LATITUDE"].values
    lons = ds["LONGITUDE"].values
    times = parse_juld(ds["JULD"].values)

    rows, summaries = [], []

    for p in range(N_PROF):
        float_id = str(float_ids[p])
        lat, lon = float(lats[p]), float(lons[p])
        time = times[p]

        pres, temp, psal = PRES[p], TEMP[p], PSAL[p]

        temps, sals, shallow_t, shallow_s = [], [], [], []
        n_valid = 0

        for i in range(N_LEVEL):
            depth = float(pres[i])
            if pd.isna(depth):
                continue

            temperature = None if pd.isna(temp[i]) else float(temp[i])
            salinity = None if pd.isna(psal[i]) else float(psal[i])

            if temperature is None and salinity is None:
                continue

            n_valid += 1
            if temperature is not None: temps.append(temperature)
            if salinity is not None: sals.append(salinity)
            if depth <= 10:
                if temperature: shallow_t.append(temperature)
                if salinity: shallow_s.append(salinity)

            rows.append({
                "float_id": float_id,
                "profile_index": p,
                "time": time,
                "latitude": lat,
                "longitude": lon,
                "depth": depth,
                "temperature": temperature,
                "salinity": salinity,
                "cycle": None,
                "qc": None,
                "source_file": filename,
                "raw_metadata": json.dumps({})
            })

        if n_valid > 0:
            summaries.append({
                "profile_key": f"{filename}:{p}",
                "float_id": float_id,
                "time": time,
                "latitude": lat,
                "longitude": lon,
                "n_levels": n_valid,
                "min_depth": float(min(pres)),
                "max_depth": float(max(pres)),
                "mean_temperature": float(pd.Series(temps).mean()) if temps else None,
                "mean_salinity": float(pd.Series(sals).mean()) if sals else None,
                "temp_surface": float(pd.Series(shallow_t).mean()) if shallow_t else None,
                "sal_surface": float(pd.Series(shallow_s).mean()) if shallow_s else None,
                "variables": ["temperature", "salinity"],
                "raw_metadata": json.dumps({})
            })

    return pd.DataFrame(rows), summaries

# ---------------- INGEST FILE ----------------
def ingest_file(file_path):
    fname = file_path.name
    sha256 = compute_sha256(file_path)

    print(f"\n📄 Processing {fname}")

    # Prevent duplicates
    if file_already_processed(fname, sha256):
        print(" - Skipped (already processed & identical)")
        return 0

    ds = xr.open_dataset(file_path)
    df, summaries = extract_profiles(ds, fname)
    ds.close()

    if df.empty:
        print(" - No valid rows")
        mark_processed(fname, sha256, 0)
        return 0

    # Export parquet
    parquet_path = PARQUET_DIR / f"{fname}.parquet"
    df.to_parquet(parquet_path)

    # Insert into Postgres
    with engine.begin() as conn:
        df.to_sql(TABLE_PROFILES, conn, if_exists="append", index=False, method="multi")

        for s in summaries:
            conn.execute(text(f"""
                INSERT INTO {TABLE_SUMMARIES}
                (profile_key, float_id, time, latitude, longitude,
                 n_levels, min_depth, max_depth, mean_temperature,
                 mean_salinity, temp_surface, sal_surface, variables, raw_metadata)
                VALUES (:profile_key, :float_id, :time, :latitude, :longitude,
                        :n_levels, :min_depth, :max_depth, :mean_temperature,
                        :mean_salinity, :temp_surface, :sal_surface,
                        :variables, :raw_metadata)
                ON CONFLICT (profile_key) DO NOTHING;
            """), s)

    mark_processed(fname, sha256, len(df))

    # Move file to processed folder
    shutil.move(str(file_path), str(PROCESSED_DIR / fname))

    print(f" - Inserted {len(df)} rows")
    print(f" - Moved to processed/: {fname}")
    print(f" - Parquet saved: {parquet_path}")

    return len(df)

# ---------------- MAIN ----------------
def main():
    create_tables()

    files = sorted(SOURCE_DIR.glob("*.nc"))
    print(f"Found {len(files)} files to ingest\n")

    total = 0
    for f in files:
        total += ingest_file(f)

    print("\n🔥 DONE — Total rows inserted:", total)

if __name__ == "__main__":
    main()
