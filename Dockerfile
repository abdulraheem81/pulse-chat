# Production Dockerfile for Pulse P2P Chat
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application source
COPY . .

# Expose server port (default 3000)
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
