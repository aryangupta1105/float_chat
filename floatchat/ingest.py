#!/usr/bin/env python3

import os
import json
from pathlib import Path
import xarray as xr
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# ------------ CONFIG ------------
DATA_DIR = Path("data")
DATABASE_URL = os.getenv("DATABASE_URL")   # Must be Railway Postgres URL
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

TABLE_PROFILES = "profiles"
TABLE_SUMMARIES = "profile_summaries"
TABLE_INGEST = "ingest_files"
BATCH_SIZE = 5000
# --------------------------------

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


# ---------------- CREATE TABLES ----------------
def create_tables():
    """Create SQL tables (NO PostGIS) — Railway compatible."""
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
                processed_at TIMESTAMPTZ DEFAULT now(),
                rows_inserted INTEGER
            );
        """))

    print("✅ Tables created successfully (Railway-safe, no PostGIS)")


# ---------------- HELPERS ----------------
def already_processed(filename):
    with engine.connect() as conn:
        q = conn.execute(
            text(f"SELECT 1 FROM {TABLE_INGEST} WHERE filename = :fn"),
            {"fn": filename}
        ).fetchone()
        return q is not None


def mark_processed(filename, rows):
    with engine.begin() as conn:
        conn.execute(text(f"""
            INSERT INTO {TABLE_INGEST} (filename, rows_inserted)
            VALUES (:fn, :rows)
            ON CONFLICT (filename)
            DO UPDATE SET rows_inserted = EXCLUDED.rows_inserted;
        """), {"fn": filename, "rows": rows})


# ---------------- JULD SAFE PARSER ----------------
def parse_juld(juld_raw):
    """
    Handles both:
    - Numeric JULD ("days since 1950-01-01")
    - ISO8601 strings ("2005-03-17T04:22:36Z")
    """
    if pd.api.types.is_numeric_dtype(juld_raw):
        return pd.to_datetime(
            juld_raw,
            unit="D",
            origin=pd.Timestamp("1950-01-01")
        )

    # Try ISO datetime strings
    try:
        return pd.to_datetime(juld_raw)
    except:
        # fallback: convert to string
        return pd.to_datetime(juld_raw.astype(str))


# ---------------- NETCDF EXTRACTOR ----------------
def extract_profiles(ds, filename):
    PRES = ds["PRES"].values
    TEMP = ds["TEMP"].values
    PSAL = ds["PSAL"].values

    # Shape detection
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

    # SAFE TIME PARSING
    times = parse_juld(ds["JULD"].values)

    rows = []
    summaries = []

    for p in range(N_PROF):
        float_id = str(float_ids[p])
        lat = float(lats[p])
        lon = float(lons[p])
        time = times[p]

        pres = PRES[p]
        temp = TEMP[p]
        psal = PSAL[p]

        levels_ok = 0
        temps_for_summary = []
        sal_for_summary = []
        shallow_temps = []
        shallow_sals = []

        for i in range(N_LEVEL):
            depth = float(pres[i])
            if pd.isna(depth):
                continue

            temperature = float(temp[i]) if not pd.isna(temp[i]) else None
            salinity = float(psal[i]) if not pd.isna(psal[i]) else None

            if temperature is None and salinity is None:
                continue

            rows.append({
                "float_id": float_id,
                "profile_index": p,
                "cycle": None,
                "time": time,
                "latitude": lat,
                "longitude": lon,
                "depth": depth,
                "temperature": temperature,
                "salinity": salinity,
                "qc": None,
                "source_file": filename,
                "raw_metadata": json.dumps({})
            })

            levels_ok += 1
            if temperature is not None:
                temps_for_summary.append(temperature)
            if salinity is not None:
                sal_for_summary.append(salinity)

            if depth <= 10:
                if temperature: shallow_temps.append(temperature)
                if salinity: shallow_sals.append(salinity)

        if levels_ok > 0:
            summaries.append({
                "profile_key": f"{filename}:{p}",
                "float_id": float_id,
                "time": time,
                "latitude": lat,
                "longitude": lon,
                "n_levels": levels_ok,
                "min_depth": float(min(pres)),
                "max_depth": float(max(pres)),
                "mean_temperature": float(pd.Series(temps_for_summary).mean()) if temps_for_summary else None,
                "mean_salinity": float(pd.Series(sal_for_summary).mean()) if sal_for_summary else None,
                "temp_surface": float(pd.Series(shallow_temps).mean()) if shallow_temps else None,
                "sal_surface": float(pd.Series(shallow_sals).mean()) if shallow_sals else None,
                "variables": ["temperature", "salinity"],
                "raw_metadata": json.dumps({})
            })

    return pd.DataFrame(rows), summaries


# ---------------- INGEST SINGLE FILE ----------------
def ingest_file(file_path):
    fname = file_path.name
    print(f"\n📄 Processing {fname}")

    if already_processed(fname):
        print(" - Skipping (already processed)")
        return 0

    ds = xr.open_dataset(file_path)
    df, summaries = extract_profiles(ds, fname)
    ds.close()

    if df.empty:
        print(" - No valid rows")
        mark_processed(fname, 0)
        return 0

    with engine.begin() as conn:
        df.to_sql(TABLE_PROFILES, conn, if_exists="append", index=False, method="multi")

        for s in summaries:
            conn.execute(text(f"""
                INSERT INTO {TABLE_SUMMARIES}
                (profile_key, float_id, time, latitude, longitude,
                n_levels, min_depth, max_depth, mean_temperature, mean_salinity,
                temp_surface, sal_surface, variables, raw_metadata)
                VALUES (:profile_key, :float_id, :time, :latitude, :longitude,
                :n_levels, :min_depth, :max_depth, :mean_temperature, :mean_salinity,
                :temp_surface, :sal_surface, :variables, :raw_metadata)
                ON CONFLICT (profile_key) DO NOTHING;
            """), s)

    mark_processed(fname, len(df))
    print(f" - Inserted {len(df)} rows")
    return len(df)


# ---------------- MAIN ----------------
def main():
    create_tables()

    files = sorted(DATA_DIR.glob("*.nc"))
    print(f"Found {len(files)} NetCDF files\n")

    total = 0
    for f in files:
        total += ingest_file(f)

    print("\n🔥 DONE — Total rows inserted:", total)


if __name__ == "__main__":
    main()
