# How to manage Twake platform

⚠️ https://stackoverflow.com/a/40537078

Checkout the `develop` branch.

Expected installation time: less than 30 minutes.

# First time setup

- setup platform configuration (mail sender, secret keys)

```shell
cd twake
cp -n docker-compose.onpremise.custom.yml docker-compose.yml
cp -nR default-configuration/ configuration/
```
- 
- setup apache2 configuration

```shell
cd twake
./start.sh
```

# Update Twake

```
git pull

cd twake

docker compose stop
docker compose rm
docker compose pull

docker compose up -d --build
```

# CQLSH
```shell
docker compose exec -it scylladb /bin/bash
```
