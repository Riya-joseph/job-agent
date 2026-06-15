FROM node:20-alpine

# Install build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Data directory for SQLite DB
RUN mkdir -p /app/data

VOLUME ["/app/data"]

CMD ["node", "src/index.js"]
