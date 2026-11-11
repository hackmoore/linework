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
cp docker-compose.example.yml docker-compose.yml
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

Remove the two `443` port lines from your `docker-compose.yml`, then proxy your domain to `http://127.0.0.1:8080`. The proxy must pass WebSocket upgrades on `/api/`. For nginx:

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

### Traefik

With Traefik, don't publish any ports. Set `LINEWORK_SITE_ADDRESS=:80`, attach the `web` service to Traefik's Docker network and add router labels. The sample file has them commented out:

```yaml
services:
  web:
    networks: [default, traefik]
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik
      - traefik.http.routers.linework.rule=Host(`linework.example.com`)
      - traefik.http.routers.linework.entrypoints=web
      - traefik.http.services.linework.loadbalancer.server.port=80

networks:
  traefik:
    external: true
```

Replace `traefik` with the name of the network Traefik uses. Traefik forwards WebSockets without extra settings. Set `LINEWORK_SITE_URL` to the `https://` address visitors use, even when Traefik's entrypoint is plain HTTP behind another TLS proxy, because the relay checks the browser's origin.

## Settings

| Variable                | Purpose                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINEWORK_SITE_ADDRESS` | What Caddy listens for: a domain (automatic HTTPS) or a port such as `:80`.                                                                 |
| `LINEWORK_SITE_URL`     | Public URL. Written into `/llms.txt`, link previews and the sitemap at build time. Only pages from this origin may join rooms on the relay. |
| `HTTP_PORT`             | Host port for HTTP. Default 80.                                                                                                             |
| `HTTPS_PORT`            | Host port for HTTPS. Default 443.                                                                                                           |
| `LINEWORK_WEB_IMAGE`    | Image for the web container. Default `linework-web`, built locally.                                                                         |
| `LINEWORK_API_IMAGE`    | Image for the relay container. Default `linework-api`, built locally.                                                                       |

Changing `LINEWORK_SITE_URL` needs a rebuild: `docker compose up -d --build`.

Your `docker-compose.yml` and `.env` are not tracked by git, so edit them freely. After pulling an update, compare your copy with `docker-compose.example.yml` for new settings.

## Updating

```sh
git pull
docker compose up -d --build
docker image prune -f
```

## Prebuilt images and automatic updates

Every push to `main` runs the checks, then publishes both images to GitHub Container Registry for `linux/amd64` and `linux/arm64`:

- `ghcr.io/hackmoore/linework-web`
- `ghcr.io/hackmoore/linework-api`

Each image is tagged `latest` and `sha-<commit>`. To use them instead of building on the server, set these in `.env`:

```sh
LINEWORK_WEB_IMAGE=ghcr.io/hackmoore/linework-web:latest
LINEWORK_API_IMAGE=ghcr.io/hackmoore/linework-api:latest
```

Then run `docker compose pull && docker compose up -d`. [Watchtower](https://containrrr.dev/watchtower/) or a similar tool can then pull new `latest` images as they are published.

The web image has the site URL built in, so it is only right for the site it was built for. The workflow takes it from the repository variable `LINEWORK_SITE_URL` (Settings > Secrets and variables > Actions > Variables). A fork must set its own variable and publish its own images.
