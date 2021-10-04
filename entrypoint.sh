#!/usr/bin/env bash
set -e

if [ ! -f ./data/pipeline/static/latest_sbdb.csv ]; then
  echo "Downloading SBDB csv from wayback machine..."
  wget 'http://web.archive.org/web/20210202035814/https://echo.jpl.nasa.gov/~lance/delta_v/delta_v.rendezvous.html' -o ./data/pipeline/static/latest_sbdb.csv
fi

echo "Running data pipeline..."
./data/pipeline/pipeline

caddy start
gunicorn --log-level debug app:app -w 4 -b 0.0.0.0:9990
