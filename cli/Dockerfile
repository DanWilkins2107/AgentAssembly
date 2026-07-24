# Runs the CLI test suite on Linux so the POSIX-permission tests always execute
# (they cannot pass on a Windows host). `npm test` builds and runs this image, so
# the Linux run is the default path — nothing is silently skipped.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "test:unit"]
