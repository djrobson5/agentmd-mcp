# agentmd-mcp — stdio MCP server for the AgentMD document conversion API.
#
# Build:  docker build -t agentmd-mcp .
# Run:    docker run -i --rm -e AGENTMD_API_KEY=<your-key> agentmd-mcp
#
# The server reads its credentials from the environment, so AGENTMD_API_KEY
# must be passed in with `-e` at run time (never baked into the image).
# AGENTMD_BASE_URL may also be passed with `-e` to target another deployment.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.mjs ./

ENV NODE_ENV=production

ENTRYPOINT ["node", "index.mjs"]
