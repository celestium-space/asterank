#!/usr/bin/env python

import os
import pymongo
from pymongo import MongoClient

SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
<url>
  <loc>https://cryptocanvas.space/asterank/</loc>
  <priority>1.00</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/about</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/3d</loc>
  <priority>0.95</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/discover</loc>
  <priority>0.90</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/exoplanets</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/galaxies/</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/api</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/mpc</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/kepler</loc>
  <priority>0.80</priority>
</url>
<url>
  <loc>https://cryptocanvas.space/asterank/skymorph</loc>
  <priority>0.80</priority>
</url>
%s
</urlset>
"""

URL_TAG_TEMPLATE = """
<url>
  <loc>%s</loc>
  <priority>%f</priority>
</url>
"""

URL_TEMPLATE = 'https://cryptocanvas.space/asterank/asteroid-%s'

connection = MongoClient(os.getenv("MONGODB_CONNECTION_STRING", "mongodb://localhost"))
jpl = connection.asterank.jpl
asteroids = connection.asterank.asteroids

url_tags = []
dedup = set()
for asteroid in jpl.find():
    if 'tag_name' not in asteroid or not asteroid['tag_name']:
        continue
    name = asteroid['tag_name']
    if name in dedup or name == 'undefined' or name == '':
        continue
    dedup.add(name)

    slug = name.lower().replace(' ', '-')
    url = URL_TEMPLATE % slug

    priority = .2
    splits = name.split(' ')
    if len(splits) > 0:
        try:
            num = int(splits[0])
            if num < 1000:
                priority = .5
        except:
            pass

    url_tags.append(URL_TAG_TEMPLATE % (url, priority))

print(SITEMAP % (''.join(url_tags)))
