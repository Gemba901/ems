#!/bin/bash
# Run this ONCE on each EC2 instance after launch.
# Usage: bash ec2-setup.sh
set -e

# ── Docker ────────────────────────────────────────────────────────────────────
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker ubuntu
sudo systemctl enable --now docker

# ── AWS CLI v2 ────────────────────────────────────────────────────────────────
sudo apt-get install -y unzip
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

# ── nginx + certbot ───────────────────────────────────────────────────────────
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx

echo ""
echo "✓ Setup complete. Next steps:"
echo "  1. Attach an IAM role with AmazonEC2ContainerRegistryReadOnly to this instance"
echo "  2. Copy your nginx config to /etc/nginx/sites-available/ and enable it"
echo "  3. Create /home/ubuntu/.env with your runtime secrets"
echo "  4. Run: sudo certbot --nginx -d <your-domain>"
echo "  5. Log out and back in (or run: newgrp docker) for docker group to take effect"
