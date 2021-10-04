#!/usr/bin/env python
#
# This crawls JPL SBDB pages for top asteroid results.
# Normally we do this on-demand when the user selects an asteroid,
# but we pre-crawl info for the more popular ones.
#

import os
from jpl_lookup import Asteroid
import pymongo
from pymongo import MongoClient

NUM_CRAWL = 1000
connection = MongoClient(os.getenv("MONGODB_CONNECTION_STRING", 'mongodb://localhost'))
db = connection.asterank

asteroids = db.asteroids
jpl = db.jpl
def process(asteroid):
  desig = asteroid['full_name']
  idx = desig.find('(')
  if idx > 0:
    desig = desig[idx:]
    idx = 0
  if idx == 0:
    desig = desig[1:-1]

  print('q:', desig)
  a = Asteroid(desig)
  a.load()
  a.data['tag_name'] = desig
  jpl.insert(a.data)

for asteroid in asteroids.find().sort('smallest', pymongo.ASCENDING).limit(NUM_CRAWL):
  process(asteroid)
for asteroid in asteroids.find().sort('price', pymongo.DESCENDING).limit(NUM_CRAWL):
  process(asteroid)
for asteroid in asteroids.find().sort('score', pymongo.DESCENDING).limit(NUM_CRAWL):
  process(asteroid)
for asteroid in asteroids.find().sort('closeness', pymongo.DESCENDING).limit(NUM_CRAWL):
  process(asteroid)
