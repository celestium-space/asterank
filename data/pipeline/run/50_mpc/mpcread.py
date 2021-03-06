#!/usr/bin/env python

import sys
import os
from pymongo import MongoClient

if len(sys.argv) < 1:
  print('usage: mpcread mpcorb.dat')
  sys.exit(1)

print('Processing...')

FILE = sys.argv[1]

f = open(FILE, 'r')
lines = f.readlines()
f.close()

# set up mongo connection
conn = MongoClient(os.getenv("MONGODB_CONNECTION_STRING", "mongodb://localhost"))
db = conn.asterank
coll = db.mpc
coll.drop()
coll.ensure_index('des', unique=True)

items = []
seen = set()
firstlineseen = False
c = 0
for object in open(FILE, 'r'):
  if object.startswith('00001'):
    firstlineseen = True
  if not firstlineseen:
    continue
  if c % 5000 == 0:
    print((c, '...'))
  c += 1
  if object.strip() == '':
    continue
  item = {}
  item['des'] = object[0:7].strip()          # in packed form
  if item['des'] in seen:
    print(('Duplicate des', item['des']))
    continue
  seen.add(item['des'])
  try:
    item['H'] = float(object[8:13])    # can be blank
  except ValueError:
    pass
  try:
    item['G'] = float(object[14:19])   # can be blank
  except ValueError:
    pass
  item['epoch'] = object[20:25]  # in packed form, .0 tt
  item['M'] = float(object[26:35])   # mean anomaly at epoch, deg
  item['w'] = float(object[37:46])   # arg of perihelion, j2000 degrees
  item['om'] = float(object[48:57])    # long of ascending node, j2k degrees
  item['i'] = float(object[59:68])    # inclination to ecliptic, j2k deg
  item['e'] = float(object[70:79])    # orbital e
  item['d'] = float(object[80:91])    # mean daily motion (deg/day)
  item['a'] = float(object[92:103])    # semimajor axis (AU)
  item['U'] = object[106]             # uncertainty parameter U
  item['ref'] = object[107:116]     # reference
  try:
    item['num_obs'] = int(object[117:122])   # num obs, can be blank
  except ValueError:
    pass
  try:
    item['num_opp'] = int(object[123:126])   # num opp, can be blank
  except ValueError:
    pass
  try:
    item['rms'] = float(object[137:141])   # rms residual ("), can be blank
  except ValueError:
    pass
  item['pert_c'] = object[142:145]   # coarse indicator of perturbers
  item['pert_p'] = object[146:149]   # precise indicator of pert
  item['comp'] = object[150:160]   # computer name

  try:
    # optional
    item['flags'] = object[161:165].strip()   # flags
    item['readable_des'] = object[166:194].strip()  # readable des
    item['last_obs'] = object[194:202].strip()    # date of last obs YYYYMMDD
  except:
    pass
  items.append(item)

  if len(items) > 50000:
    # insert into mongo
    print(('Inserting/updating %d items into MPC collection' % (len(items))))
    coll.insert(items, continue_on_error=True)
    items = []
print(('Inserting/updating %d items into MPC collection' % (len(items))))
coll.insert(items, continue_on_error=True)
items = []
