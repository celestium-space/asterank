FROM python:3.9-bullseye

# python deps
COPY ./requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

# caddy
# https://caddyserver.com/docs/install#debian-ubuntu-raspbian
RUN apt-get update -y && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
RUN curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | tee /etc/apt/trusted.gpg.d/caddy-stable.asc
RUN curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
RUN apt-get update -y && apt-get install caddy -y

# copy in app
WORKDIR /app
COPY api.py ./
COPY app.py ./
COPY asterank ./asterank/
COPY calc/ ./calc/
COPY data/ ./data/
COPY filters.py ./
COPY gunicorn.sh ./
COPY local_config_example.py ./
COPY scripts/ ./scripts/
COPY sdss/ ./sdss/
COPY skymorph/ ./skymorph/
COPY stackblink/ ./stackblink/
COPY static/ ./static/
COPY templates/ ./templates/
COPY upstart/ ./upstart/
COPY util.py ./
COPY ./Caddyfile ./
COPY ./entrypoint.sh ./

# apparently this folder needs to exist
RUN mkdir -p /var/asterank/neat_binary_store
RUN mkdir -p /var/asterank/neat_binary_cache
RUN mkdir -p /var/asterank/skymorph_store
RUN mkdir -p /var/asterank/skymorph_cache

# start gunicorn & caddy
ENTRYPOINT /app/entrypoint.sh
