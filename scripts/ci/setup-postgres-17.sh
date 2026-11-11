#!/usr/bin/env bash
set -euo pipefail

# PGDG packages for Ubuntu 24.04 amd64. SHA-256 values come from
# https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/main/binary-amd64/Packages.gz
base=https://apt.postgresql.org/pub/repos/apt
archive=https://apt-archive.postgresql.org/pub/repos/apt
directory=$(mktemp -d "${RUNNER_TEMP:?}/liftgo-postgres17.XXXXXX")

extract_package() {
  local relative=$1 sha=$2 file
  file="$directory/${relative##*/}"
  if ! curl --proto '=https' --fail --silent --show-error --retry 2 --retry-max-time 30 \
    --connect-timeout 10 --max-time 20 --output "$file" "$base/$relative"; then
    curl --proto '=https' --fail --silent --show-error --retry 2 --retry-max-time 30 \
      --connect-timeout 10 --max-time 20 --output "$file" "$archive/$relative"
  fi
  printf '%s  %s\n' "$sha" "$file" | sha256sum --check
  dpkg-deb --extract "$file" "$directory"
}

extract_package pool/main/p/postgresql-17/postgresql-17_17.11-1.pgdg24.04+2_amd64.deb \
  d5b58058a82a3f344f832aea2cc54badc4f6265c25c960752cb1f5df5d2180ee
extract_package pool/main/p/postgresql-17/postgresql-client-17_17.11-1.pgdg24.04+2_amd64.deb \
  b3b071b67a814a382516d6f6241b529c52f909672457e2f48083acce047b634f
extract_package pool/main/p/postgresql-18/libpq5_18.6-1.pgdg24.04+2_amd64.deb \
  b487c5ed2ceb9244c6a9d6ae65818ed6707c3c44a2e14488394ae4194c52c53b

bin="$directory/usr/lib/postgresql/17/bin"
lib="$directory/usr/lib/x86_64-linux-gnu"
for command in initdb pg_ctl postgres; do
  test -x "$bin/$command"
  LD_LIBRARY_PATH="$lib" "$bin/$command" --version
done
printf 'bin=%s\nlib=%s\n' "$bin" "$lib" >> "${GITHUB_OUTPUT:?}"
