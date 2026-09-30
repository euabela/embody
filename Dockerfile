# Self-hosted emBODY with data collection:
#   docker build -t embody .
#   docker run -p 8000:8000 -v $PWD/data:/data -e EMBODY_ADMIN_PASSWORD=change-me embody
FROM python:3.12-alpine
WORKDIR /app
COPY . .
ENV EMBODY_DATA=/data PORT=8000
# Point the experiment at the bundled server
RUN sed -i 's|endpoint: ""|endpoint: "api/submit"|' config.js
RUN adduser -D embody && mkdir -p /data && chown embody /data
USER embody
EXPOSE 8000
VOLUME /data
CMD ["python3", "server/server.py"]
