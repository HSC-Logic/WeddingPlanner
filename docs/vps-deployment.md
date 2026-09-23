# VPS Deployment

Vow Planner is deployed as static files to `/var/www/wedding-planner`. GitHub Actions connects over SSH on port `10030`, clears the directory, then uploads the Vite `dist/` output.

## Prerequisites

- Ubuntu/Debian VPS with SSH access
- A deployment user with permission to write `/var/www/wedding-planner`
- Caddy installed as a systemd service
- DNS records pointing the domain to the VPS public IP

Replace `DEPLOY_USER` with the value configured in the `VPS_DEPLOY_USER` GitHub variable.

## Create the directory

Run these commands on the VPS as a user with `sudo` access:

```bash
sudo mkdir -p /var/www/wedding-planner
sudo chown -R github-actions:github-actions /var/www/wedding-planner
sudo find /var/www/wedding-planner -type d -exec chmod 755 {} \;
sudo find /var/www/wedding-planner -type f -exec chmod 644 {} \;
```

The deployment user must own the directory because the workflow removes old files and uploads new files without `sudo`. Caddy only needs read and directory-traverse access. `755` directories and `644` files provide that access without making files writable by other users.

If `/var/www` has restrictive permissions, grant directory traversal without making it writable:

```bash
sudo chmod 755 /var/www
```

Do not use `chmod 777`.

## Configure DNS

Create an `A` record for `tiemyknot.hsclogic.link` pointing to the VPS public IPv4 address. Add an `AAAA` record only if the VPS has working IPv6 configured.

Create the DNS records before changing the public Caddy or fronting-proxy route.

## Configure Caddy

Add a dedicated local Caddy listener for Vow Planner. The application uses port `8082` to avoid conflicting with other sites:

```caddyfile
:8082 {
    root * /var/www/wedding-planner
    encode zstd gzip
    try_files {path} /index.html
    file_server
}
```

`try_files` serves `index.html` for client-side navigation. This listener is intended for a fronting reverse proxy on the same server. Do not expose port `8082` publicly unless required by the server topology.

Route `tiemyknot.hsclogic.link` to `http://127.0.0.1:8082` in the fronting proxy. The fronting proxy owns the public HTTPS certificate and ports `80` and `443`.

Validate before applying changes:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

Reload Caddy without stopping the service:

```bash
sudo systemctl reload caddy
```

Use a full restart only when required by a service-level change:

```bash
sudo systemctl restart caddy
```

Check status and logs:

```bash
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

## Change the domain

1. Create DNS records for the new domain.
2. Change the fronting proxy route from `tiemyknot.hsclogic.link` to the new domain; keep the upstream `http://127.0.0.1:8082`.
3. Run `sudo caddy validate --config /etc/caddy/Caddyfile`.
4. Run `sudo systemctl reload caddy`.

## GitHub Actions configuration

Add these under **Settings → Secrets and variables → Actions**:

- Secret: `VPS_DEPLOY_SSH_KEY`, containing the private SSH key for the deployment user
- Variable: `VPS_DEPLOY_HOST`, containing the VPS hostname or IP address
- Variable: `VPS_DEPLOY_USER`, containing the deployment username

The workflow runs on pushes to `main` and can also be started manually from **Actions → Deploy Vow Planner → Run workflow**.

## Deployment verification

After a successful workflow run, verify the production URL loads and that the PWA remains functional:

- Open `https://tiemyknot.hsclogic.link`.
- Reload once to confirm static assets load from the deployed root.
- Confirm browser install or Add to Home Screen remains available.
- Disable network after the first successful load and confirm the app shell opens.
