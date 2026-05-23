FROM node:20-alpine

# Set node environment
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy native JavaScript source code and serverless handlers
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY api/ ./api/

# Ensure data and logs folders exist inside the container
RUN mkdir -p data logs

# Expose server port
EXPOSE 3000

# Start the persistent daemon
CMD ["npm", "start"]
