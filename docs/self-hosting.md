# Self-hosting with Docker Compose

Linework runs as two containers, both published to GitHub Container Registry for `linux/amd64` and `linux/arm64`:

- **web** (`ghcr.io/hackmoore/linework-web`): Caddy serving the app. It forwards `/api` to the relay and, when given a domain name, gets and renews an HTTPS certificate automatically.
- **api** (`ghcr.io/hackmoore/linework-api`): the live-collaboration relay. It only forwards end-to-end encrypted messages and stores nothing. It is optional.

Charts live in each visitor's browser, so there is no database and nothing to back up.

## Requirements

- Docker with the Compose plugin (`docker compose version`).
- For automatic HTTPS: a DNS record pointing at the server, and ports 80 and 443 open.

HTTPS matters. Browsers only allow the encryption that live collaboration uses on secure pages (HTTPS or `localhost`). Everything else works over plain HTTP.

## Run it

1. Copy the example Compose file from the [README](../README.md#self-hosting) into `docker-compose.yml` on your server.
2. Replace `linework.example.com` with your domain in all three places.
3. Start it:

```sh
docker compose up -d
```

Open `https://your-domain`. The first start takes a moment while Caddy gets a certificate.

Check status and logs:

```sh
docker compose ps
docker compose logs -f
```

## Without live collaboration

The `api` service is optional. Leave it out of `docker-compose.yml` and everything else works as usual. The editor checks for the relay when it opens and, if there is none, disables the **Share live** button. Live links then explain that live sessions aren't set up on this server.

## Behind an existing reverse proxy

If nginx, Traefik or another Caddy already handles HTTPS on the server, let it do so and have Linework serve plain HTTP on a spare port. In the `web` service:

```yaml
environment:
  LINEWORK_SITE_ADDRESS: ":80"
  LINEWORK_SITE_URL: https://linework.example.com
ports:
  - "127.0.0.1:8080:80"
```

Then proxy your domain to `http://127.0.0.1:8080`. The proxy must pass WebSocket upgrades on `/api/`. For nginx:

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

With Traefik, don't publish any ports. Set `LINEWORK_SITE_ADDRESS: ":80"`, attach the `web` service to Traefik's Docker network and add router labels:

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

| Service | Variable                   | Purpose                                                                                                                                                      |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web     | `LINEWORK_SITE_ADDRESS`    | What Caddy listens for: a domain (automatic HTTPS) or a port such as `:80`. Default `:80`.                                                                   |
| web     | `LINEWORK_SITE_URL`        | Public URL, such as `https://linework.example.com`. Written into `/llms.txt`, link previews and the sitemap when the container starts. No rebuild is needed. |
| api     | `LINEWORK_ALLOWED_ORIGINS` | Comma-separated origins allowed to join rooms, normally the same as `LINEWORK_SITE_URL`. Empty allows any origin.                                            |

## Updating

```sh
docker compose pull
docker compose up -d
docker image prune -f
```

Every push to `main` publishes new images tagged `latest` and `sha-<commit>`. Pin a `sha-` tag to stay on one version, or let [Watchtower](https://containrrr.dev/watchtower/) or a similar tool pull new `latest` images as they are published.

## Building the images yourself

From a clone of the repository:

```sh
docker build --target web -t linework-web .
docker build --target api -t linework-api .
```

Then use `image: linework-web` and `image: linework-api` in your `docker-compose.yml`.
