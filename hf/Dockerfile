FROM node:lts-alpine3.22

# Arguments
ARG APP_HOME=/home/node/app
ARG REPO_URL=https://github.com/wosa1402/SillyTarvernchat-docker.git

# Install system dependencies
RUN apk add --no-cache gcompat tini git git-lfs dos2unix

# Create app directory
WORKDIR ${APP_HOME}

# Set NODE_ENV to production
ENV NODE_ENV=production

# Clone the repository from GitHub
RUN \
  echo "*** Cloning repository ***" && \
  git clone --depth 1 ${REPO_URL} . && \
  rm -rf .git

# Copy HuggingFace specific files (from hf/ directory)
COPY docker-entrypoint.sh ./docker/docker-entrypoint.sh

# Install main app dependencies
RUN \
  echo "*** Install npm packages ***" && \
  npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev && npm cache clean --force

# Install backup-sync dependencies
RUN \
  echo "*** Install backup-sync packages ***" && \
  cd backup-sync && npm i --no-audit --no-fund --loglevel=error --no-progress --omit=dev && cd ..

# Create config directory and link config.yaml
RUN \
  rm -f "config.yaml" || true && \
  ln -s "./config/config.yaml" "config.yaml" || true && \
  mkdir "config" || true

# Pre-compile public libraries
RUN \
  echo "*** Run Webpack ***" && \
  node "./docker/build-lib.js"

# Set the entrypoint script
RUN \
  echo "*** Setup entrypoint ***" && \
  mv "./docker/docker-entrypoint.sh" "./" && \
  rm -rf "./docker" && \
  echo "*** Make docker-entrypoint.sh executable ***" && \
  chmod +x "./docker-entrypoint.sh" && \
  echo "*** Convert line endings to Unix format ***" && \
  dos2unix "./docker-entrypoint.sh"

# Fix extension repos permissions
RUN git config --global --add safe.directory "*"

# Hugging Face Space 运行在 7860 端口
EXPOSE 7860

# Ensure proper handling of kernel signals
ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
