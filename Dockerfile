# Runs the Node adapter (server.js), which serves the site and the same /api
# handlers the Cloudflare Worker uses. Accounts and scores are saved in /app/data.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Server side
COPY package.json server.js worker.js ./
COPY functions/ ./functions/

# Site
COPY index.html styles.css sw.js manifest.webmanifest bible-verses.js Favicon.png typemine-galactic-logo.png ./
COPY js/ ./js/
COPY css/ ./css/
COPY icons/ ./icons/
COPY assets/ ./assets/
COPY ["Sound Effects/", "./Sound Effects/"]

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
