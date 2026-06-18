# Pin to a specific Deno version for reproducible builds.
FROM denoland/deno:2.8.3

# The unnamed Deno KV store lives under DENO_DIR. Pointing it at a
# dedicated directory lets you mount a volume there so presence state
# survives container restarts.
ENV DENO_DIR=/deno-dir
ENV DENO_KV_PATH=/data/kv.sqlite3

WORKDIR /app

# Cache dependencies as a separate layer so they are only re-fetched
# when the import graph changes, not on every source edit.
COPY deno.jsonc main.ts ./
RUN deno cache main.ts

# Persisted KV database lives here — mount a volume at /data.
RUN mkdir -p /data && chown -R deno:deno /data /deno-dir
VOLUME ["/data"]

# Drop to the unprivileged user shipped in the base image.
USER deno

EXPOSE 8000

# --allow-read/-write are needed for the .env file (optional) and the
# SQLite KV database; --unstable-kv enables Deno.openKv().
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--unstable-kv", "main.ts"]
