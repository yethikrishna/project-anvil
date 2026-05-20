# Oracle Cloud Always Free Deployment Guide

> Oracle Cloud's Always Free tier: 4 ARM Ampere A1 cores + 24 GB RAM + 200 GB block storage.
> Perfect for running the entire Anvil stack at zero cost.

## Always Free Resources

| Resource | Free Tier |
|----------|-----------|
| ARM Compute | 4 OCPU + 24 GB RAM |
| Block Storage | 200 GB total (4 × 50 GB) |
| Object Storage | 20 GB |
| Egress | 10 TB/month |
| Load Balancer | 1 (10 Mbps) |
| DNS | Included (OCI DNS) |
| Databases | 2 Autonomous DBs (20 GB each) |

## 1. Create ARM Instance

```bash
# OCI CLI or Console:
# Shape: VM.Standard.A1.Flex (ARM)
# OCPUs: 4
# Memory: 24 GB
# OS: Ubuntu 22.04 (Canonical)
# Boot volume: 50 GB
```

### via OCI CLI:

```bash
oci compute instance launch \
  --availability-domain "adXX-region" \
  --compartment-id <compartment-ocid> \
  --shape VM.Standard.A1.Flex \
  --shape-config '{"ocpus": 4, "memoryInGBs": 24}' \
  --source-details '{"sourceType": "image", "imageId": "<ubuntu-2204-arm64-ocid>"}' \
  --subnet-id <subnet-ocid> \
  --display-name "anvil-server"
```

## 2. Initial Setup

```bash
# SSH into the instance
ssh ubuntu@<public-ip>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js 22 (ARM64)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm
```

## 3. Clone & Build

```bash
git clone https://github.com/yethikrishna/project-anvil.git
cd project-anvil

# Install dependencies
pnpm install

# Build all apps
pnpm build

# Copy environment template
cp .env.example .env
# Edit .env with your values
```

## 4. Run with Docker Compose

```bash
# Start infrastructure
docker-compose up -d postgres redis minio keycloak

# Wait for services to be healthy
docker-compose ps

# Start app APIs
docker-compose up -d drive-api docs-api search-api gmail-api
```

## 5. Run Frontend Apps

```bash
# Using PM2 for process management
npm install -g pm2

# Start all frontend apps
pm2 start "pnpm --filter @anvil/drive dev -- --port 3001" --name drive
pm2 start "pnpm --filter @anvil/docs dev -- --port 3002" --name docs
pm2 start "pnpm --filter @anvil/youtube dev -- --port 3003" --name youtube
pm2 start "pnpm --filter @anvil/maps dev -- --port 3004" --name maps
pm2 start "pnpm --filter @anvil/search dev -- --port 3005" --name search
pm2 start "pnpm --filter @anvil/gmail dev -- --port 3006" --name gmail

# Save & enable auto-restart
pm2 save
pm2 startup
```

## 6. Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/anvil.conf
server {
    listen 80;
    server_name anvil.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name anvil.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/anvil.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/anvil.yourdomain.com/privkey.pem;

    # Drive
    location /drive {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Docs (needs WebSocket for Hocuspocus)
    location /docs {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # YouTube
    location /video {
        proxy_pass http://127.0.0.1:3003;
    }

    # Maps
    location /maps {
        proxy_pass http://127.0.0.1:3004;
    }

    # Search
    location / {
        proxy_pass http://127.0.0.1:3005;
    }

    # Gmail
    location /mail {
        proxy_pass http://127.0.0.1:3006;
    }

    # Keycloak
    location /auth {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/anvil.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL with certbot
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d anvil.yourdomain.com
```

## 7. OCI Networking

### Open Required Ports

```bash
# OCI Console → Networking → Virtual Cloud Network → Security Lists
# Add Ingress Rules:

# HTTP
Port: 80, Source: 0.0.0.0/0
# HTTPS
Port: 443, Source: 0.0.0.0/0
# SSH
Port: 22, Source: <your-ip>/32
```

### OCI Firewall (iptables)

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 8. Performance Tuning (ARM)

```bash
# Increase file watchers
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Swap (if needed for builds)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Cost: $0/month

The entire Anvil stack runs within Oracle's Always Free tier:
- 4 ARM cores handle all 7 frontend apps + 6 backend APIs
- 24 GB RAM is more than enough for PostgreSQL, Redis, MinIO, and Keycloak
- 200 GB storage covers databases + file uploads
- 10 TB egress is generous for personal/portfolio use
