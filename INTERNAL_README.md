# How to manage Twake platform

⚠️ https://stackoverflow.com/a/40537078

Checkout the `develop` branch.

Expected installation time: less than 30 minutes.

# First time setup

```shell
cd twake
./start.sh
```

# Update Twake

```
git pull

cd twake

docker-compose stop
docker-compose rm
docker-compose pull

docker-compose up -d --build
```
