# syntax=docker/dockerfile:1

# Supports ARM + x86-64
# 'as base' allows us to refer to this build stage in other build stages
FROM node:22 as base


#install zshell
RUN apt-get update && apt-get install -y zsh


SHELL ["/bin/zsh", "-c"]

RUN apt-get update && \
    apt-get -y install iproute2  lsof vim less curl jq python3 python3-requests python3-dotenv python3-colorama && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


ENV PUPPETEER_SKIP_DOWNLOAD true
# Add OpenAI API key environment variable with a default empty value

WORKDIR /home/pptruser/app


RUN apt-get update \
    && apt-get install -y chromium python3-pip \
      --no-install-recommends \    
    && rm -rf /var/lib/apt/lists/*


RUN pip3 install --break-system-packages cfn-lint    
RUN npm i puppeteer \
    # Add user so we don't need --no-sandbox.
    # same layer as npm install to keep re-chowned files from using up several hundred MBs more space
    && groupadd -r pptruser && useradd -r -s /bin/zsh -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser
    # && chown -R pptruser:pptruser node_modules/ \
    # && chown -R pptruser:pptruser package.json \
    # && chown -R pptruser:pptruser package-lock.json \
    # && chown -R pptruser:pptruser /app


RUN npm i -g pnpm bun wrangler
# Run everything after as non-privileged user.

COPY scripts /home/pptruser/app/scripts
RUN ls -R /home/pptruser/app/scripts/package-installs

RUN find /home/pptruser/app/scripts -type f -name "*.sh" -exec chmod +x {} \; && \
    /home/pptruser/app/scripts/package-installs/install-aws-cli.py


# Refering to base, and adding new build stage label 'dev'
FROM base as dev
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium


USER pptruser
COPY . .
CMD ["zsh"]

