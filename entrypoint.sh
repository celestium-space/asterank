#!/usr/bin/env bash
set -e

if [ ! -f ./data/pipeline/static/latest_sbdb.csv ]; then
  echo "Downloading SBDB csv"
  wget 'https://www.ianww.com/latest_fulldb.csv' -O ./data/pipeline/static/latest_sbdb.csv
fi

echo "Running data pipeline..."
./data/pipeline/pipeline

caddy start
gunicorn --log-level debug app:app -w 4 -b 0.0.0.0:9990
