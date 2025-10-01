# syntax=docker/dockerfile:1

# Supports ARM + x86-64
# 'as base' allows us to refer to this build stage in obridger build stages
FROM node:22 as base


#install zshell
RUN apt-get update && apt-get install -y zsh


SHELL ["/bin/zsh", "-c"]

RUN apt-get update && \
    apt-get -y install iproute2  lsof vim less curl jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


ARG APP_USER=bridgeuser

WORKDIR /home/bridgeuser/app


RUN apt-get update && apt-get install -y dumb-init \
    && groupadd -r $APP_USER && useradd -r -s /bin/bash -g $APP_USER $APP_USER \
    && mkdir -p /home/$APP_USER \
    && chown -R $APP_USER:$APP_USER /home/$APP_USER \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \    

RUN npm i g bun
# Refering to base, and adding new build stage label 'dev'
FROM base as dev


USER $APP_USER
COPY . .
CMD ["zsh"]

