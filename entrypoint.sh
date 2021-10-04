#!/usr/bin/env bash
set -e

SBDBFILE=./data/pipeline/static/latest_sbdb.csv 
if [ ! -f $SBDBFILE ]; then
  echo "Downloading SBDB csv"
  wget 'https://www.ianww.com/latest_fulldb.csv' -O $SBDBFILE
fi

# count entries in mongo, to determine whether a scrape is needed
COUNT=$(python3 -c "import pymongo; print(pymongo.MongoClient('$MONGODB_CONNECTION_STRING').asterank.asteroids.estimated_document_count())")
echo "Found $COUNT entries in mongo."

if [ $COUNT -lt 700000 ]; then
  echo "Running data pipeline..."
  ./data/pipeline/pipeline
fi

caddy start
gunicorn --log-level debug app:app -w 4 -b 0.0.0.0:9990
