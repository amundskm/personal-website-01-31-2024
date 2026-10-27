#!/bin/sh
# Launch script for the content API's Lightsail boxes (production and QA):
# swap, Docker for Kamal, and automatic security updates. Lightsail runs it
# with /bin/sh after its own setup, so it must be POSIX sh (no bash options).
set -eux

# 2 GB of swap: resizing a large photo can briefly need more than the 1 GB of RAM
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl --system

# Docker, used by Kamal; the ubuntu user deploys
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

# Security updates (unattended-upgrades is on by default in Ubuntu; make sure)
apt-get install -y unattended-upgrades
touch /var/lib/cloud/instance/content-api-ready
