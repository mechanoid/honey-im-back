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

# Permissions come from the "app" set defined in deno.jsonc.
CMD ["run", "-P=run", "main.ts"]
