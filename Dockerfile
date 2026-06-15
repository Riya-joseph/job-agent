FROM node:20-alpine

# Build tools for better-sqlite3 native compilation.
# libc6-compat fixes the "fcntl64: symbol not found" error on Alpine/Fly.io
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

COPY package*.json ./

# --build-from-source forces better-sqlite3 to compile natively
# instead of using a pre-built binary built against a different glibc
RUN npm install --omit=dev --build-from-source

COPY . .

RUN mkdir -p /app/data

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]