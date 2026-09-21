@echo off
docker run --rm -v "%cd%:/project" electronuserland/builder sh -c "cd /project && npm install && npm run build:linux"