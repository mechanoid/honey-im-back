# Pin to a specific Deno version for reproducible builds.
FROM denoland/deno:2.8.3

WORKDIR /app

# Cache dependencies as a separate layer so they are only re-fetched
# when the import graph changes, not on every source edit.
COPY deno.jsonc main.ts ./
RUN deno cache main.ts

# Run as the unprivileged user shipped in the base image.
USER deno

EXPOSE 8000

# State lives in Redis (configured via REDIS_URL), so no local volume
# or write permission is needed. --allow-read covers the optional .env file.
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "main.ts"]
