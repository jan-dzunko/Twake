# How to manage Twake platform

Checkout the `develop` branch.

Expected installation time: less than 30 minutes.

# First time setup

```shell
./twake/start.sh
```

# Update Twake

```
git pull

docker-compose stop
docker-compose rm
docker-compose pull

docker-compose up -d --build
```
