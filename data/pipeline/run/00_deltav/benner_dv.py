#!/usr/bin/env python
#
# Parses delta v file from Lance Benner
# @ http://echo.jpl.nasa.gov/~lance/delta_v/delta_v.rendezvous.html
#

import csv
import re
import io
import sys
import urllib.request, urllib.error, urllib.parse

# this URL disappeared between 2021-02-02 and 2021-04-12
# BENNER_URL = 'http://echo.jpl.nasa.gov/~lance/delta_v/delta_v.rendezvous.html'
BENNER_URL = 'http://web.archive.org/web/20210202035814/https://echo.jpl.nasa.gov/~lance/delta_v/delta_v.rendezvous.html'

def process_from_internet():
  data = urllib.request.urlopen(BENNER_URL).read()
  return process(data)

def process(text):
  lines = text.splitlines()
  r = re.compile((
      '\s*(?P<rank>\d+)'
      '\s+(?P<percentile>\d+\.\d+)'
      '\s+(?P<name>\(\d+\)(\s+[-\w ]+)?)?'
      '\s+(?P<pdes1>\d+)'
      '\s+(?P<pdes2>[-\w]+)'
      '\s+(?P<deltav>\d+\.\d+)'
      '\s+(?P<h>\d+\.\d+)'
      '\s+(?P<a>\d+\.\d+)'
      '\s+(?P<e>\d+\.\d+)'
      '\s+(?P<i>\d+\.\d+)'))
  c = 0
  buf = io.StringIO()
  fields = ('pdes', 'dv', 'H', 'a', 'e', 'i')
  writer = csv.DictWriter(buf, fields)
  writer.writeheader()
  for line in lines:
    c+=1
    if c < 4:
      continue

    m = r.match(line.decode('utf8'))
    if not m:
      continue

    writer.writerow({
        'pdes': ('%s %s' % (m.group('pdes1'), m.group('pdes2'))).strip(),
        'dv': m.group('deltav'),
        'H': m.group('h'),
        'a': m.group('a'),
        'e': m.group('e'),
        'i': m.group('i')
        })
  return buf.getvalue()

if __name__ == "__main__":
  if len(sys.argv) > 1:
    TARGET = sys.argv[1]
    #TARGET = 'dv.2013.04.14'

    f = open(TARGET, 'r')
    data = f.read()
    f.close()
    print((process(data)))
  else:
    print((process_from_internet()))
