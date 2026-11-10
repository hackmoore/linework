# Self-hosting with Docker Compose

Linework runs as two containers:

- **web**: Caddy serving the built app. It also forwards `/api` to the relay and, when given a domain name, gets and renews an HTTPS certificate automatically.
- **api**: the live-collaboration relay. It only forwards end-to-end encrypted messages and stores nothing.

Charts live in each visitor's browser, so there is no database and nothing to back up.

## Requirements

- Docker with the Compose plugin (`docker compose version`).
- For automatic HTTPS: a DNS record pointing at the server, and ports 80 and 443 open.

HTTPS matters. Browsers only allow the encryption that live collaboration uses on secure pages (HTTPS or `localhost`). Everything else works over plain HTTP.

## Run it

```sh
git clone <your fork or this repo> linework && cd linework
cp .env.example .env
# Edit .env: set LINEWORK_SITE_ADDRESS and LINEWORK_SITE_URL to your domain.
docker compose up -d --build
```

Open `https://your-domain`. The first start takes a minute while the images build and Caddy gets a certificate.

Check status and logs:

```sh
docker compose ps
docker compose logs -f
```

## Behind an existing reverse proxy

If nginx, Traefik or another Caddy already handles HTTPS on the server, let it do so and serve plain HTTP from Linework on a spare port:

```sh
LINEWORK_SITE_ADDRESS=:80
LINEWORK_SITE_URL=https://linework.example.com
HTTP_PORT=8080
```

Remove the two `443` port lines from `docker-compose.yml`, then proxy your domain to `http://127.0.0.1:8080`. The proxy must pass WebSocket upgrades on `/api/`. For nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;
}
```

## Settings

| Variable                | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `LINEWORK_SITE_ADDRESS` | What Caddy listens for: a domain (automatic HTTPS) or a port such as `:80`.                                      |
| `LINEWORK_SITE_URL`     | Public URL. Written into `/llms.txt` at build time, and only pages from this origin may join rooms on the relay. |
| `HTTP_PORT`             | Host port for HTTP. Default 80.                                                                                  |
| `HTTPS_PORT`            | Host port for HTTPS. Default 443.                                                                                |

Changing `LINEWORK_SITE_URL` needs a rebuild: `docker compose up -d --build`.

## Updating

```sh
git pull
docker compose up -d --build
docker image prune -f
```
