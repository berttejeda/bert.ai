# Overview

This docker compose project builds a full-featured commandline experience for SREs with a knack for data science, AI, research, etc.

It utilizes the python:3.13 base image.

Feel free to review the [docker-compose.yml](docker-compose.yml).

# Prerequisites

## OSX

### To be executed from the **HOST** running the docker container

- Install docker

```shell
brew install docker
```

- Install docker `buildx` and `compose` cli-plugins

```shell
mkdir -p ~/.docker/cli-plugins/
DOCKER_COMPOSE_VERSION=v2.32.4
curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-darwin-x86_64" -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
DOCKER_BUILDX_VERSION=v0.21.1
curl -SL "https://github.com/docker/buildx/releases/download/${DOCKER_BUILDX_VERSION}/buildx-${DOCKER_BUILDX_VERSION}.darwin-arm64" -o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-buildx
```

- Create your res-cli zsh history file

```shell
touch $HOME/.zsh_history_res-cli
```

- Login to any of your AWS profiles

```shell
aws sso login --profile=${AWS_PROFILE}
```

- Create the res-cli container's environment file `.env-res`, e.g.

```shell
TZ="US/Eastern"
```

- Bring the docker compose project up, ensuring you build the docker image

```shell
docker compose up -d --build
```

- **If the build fails at first, try running it again**
- Attach to the running container

```shell
docker compose exec -it sre-res-cli zsh -l
```

## About the docker-compose.yml project definition

### Volume Mounts

The default volume mounts are:

- $HOME/.aws:/home/svcres/.aws
- $HOME/.config:/home/svcres/.config
- $HOME/.kube:/home/svcres/.kube
- $HOME/.zsh_history_res-cli:/home/svcres/.zsh_history:rw
- $HOME/.ssh.docker:/home/svcres/.ssh
- $HOME/git:/home/svcres/git
- $PWD/entrypoint.sh:/usr/local/bin/entrypoint.sh
- $PWD:/opt/infra
- /var/run/docker.sock:/var/run/docker.sock

Adjust your paths as needed.

## Appendix

### Connecting to the container via SSH

As per the [docker-compose.yaml](docker-compose.yaml) file,
the ssh daemon process on the container is exposed via port `2222`.

To connect via ssh, run: `ssh -i ./id_rsa svcres@localhost -p 2222`

You'll have to populate the container's `~/.ssh/authorized_keys` file with your ssh key.
