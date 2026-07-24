# Runs the CLI test suite on Linux so the POSIX-permission tests (skipped on
# Windows hosts) are actually exercised. Usage: `npm run test:docker`.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]
