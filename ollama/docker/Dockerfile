# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 python:3.13
ENV DEBIAN_FRONTEND=noninteractive
ENV SETUP_HOME=/setup

RUN apt -y update

RUN echo " Installing sudo to emulate normal OS behavior..."  | tee -a /install.log &&\
  rm -f /etc/sudoers && apt -y install sudo

RUN echo " Adjusting sudoers rules"  | tee -a /install.log &&\
  echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers.d/default

RUN echo " Installing system packages"  | tee -a /install.log &&\
  apt -y install \
  curl \
  wget \
  gettext-base \
  unzip \
  grep \
  gcc \
  jq \
  dos2unix \
  iputils-ping \
  lsb-release \
  sshpass \
  openssh-client \
  openssh-server \
  rsync \
  bash \
  mkisofs \
  dnsutils \
  html2text \
  git \
  smbclient &&\
  echo "Successfully installed system packages"  | tee -a /install.log

RUN echo " Installing additional system packages"  | tee -a /install.log &&\
  apt -y install \
  socat \
  screen \
  wget \
  unzip \
  sudo \
  vim \
  ca-certificates \
  gnupg \
  less \
  apt-transport-https \
  iproute2 \
  kmod \
  pkg-config \
  lsof \
  net-tools \
  zsh \
  arping \
  tcpdump \
  traceroute \
  zip \
  build-essential \
  libssl-dev \
  zlib1g-dev \
  libbz2-dev \
  libreadline-dev \
  libsqlite3-dev \
  llvm \
  libncursesw5-dev \
  xz-utils \
  tk-dev \
  libxml2-dev \
  libxmlsec1-dev \
  libffi-dev \
  liblzma-dev \
  zstd &&\
  echo "Successfully installed additional system packages"  | tee -a /install.log

# SSH login fix. Otherwise user is kicked off after login
RUN echo " Applying ssh login fix" | tee -a /install.log &&\
  sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd &&\
  echo "Successfully applied ssh login fix" | tee -a /install.log

RUN echo " Installing pip setuptools wheel"  | tee -a /install.log &&\
  pip3 install --upgrade pip setuptools wheel &&\
  echo "Successfully installed pip setuptools wheel"  | tee -a /install.log

ENV CRYPTOGRAPHY_DONT_BUILD_RUST=1

WORKDIR $SETUP_HOME

ENV USER=svcres
ENV GROUP=svcres
ENV USERHOME=/home/$USER
# HISTDIR: directory where we store $HISTFILE
ENV HISTDIR=$USERHOME/hist 
ENV USER_PYTHON_LOCAL=/opt/python/.local
ENV OPT_BIN=/opt/bin
ENV OPT_PYTHON=/opt/python/site-packages
ENV OPT_PYTHON_BIN=${OPT_PYTHON}/bin
ENV PATH="${OPT_PYTHON_BIN}:${OPT_BIN}:${PATH}"
# ENV PYTHONPATH="/usr/local/lib/python3.13/site-packages:${OPT_PYTHON}"
ARG UID=5000
ARG GID=5000
ENV UID=$UID
ENV GID=$GID

RUN mkdir -p $OPT_BIN

RUN echo " Creating service user ${USER} and home files"  | tee -a /install.log &&\
  useradd -m -s /bin/zsh -G sudo --uid "$UID" "$USER" &&\
  mkdir $HISTDIR &&\
  chown -R $USER:$GROUP /opt &&\
  chown -R $USER:$GROUP $HISTDIR &&\
  echo "Successfully created user ${USER}"  | tee -a /install.log

# Test sudo
RUN echo " Testing sudo functionality"  | tee -a /install.log &&\
  sudo ls &&\
  echo "sudo functionality passed"  | tee -a /install.log

# # RUN mkdir -p $USER_PYTHON_LOCAL &&\
# # chown -R $USER:$GROUP $USER_PYTHON_LOCAL

RUN echo " linking python3 to /usr/bin/python"  | tee -a /install.log &&\
  ln -s $(which python3) /usr/bin/python &&\
  echo "Successfully linked python3"  | tee -a /install.log

# awscli
ENV AWS_CLI_VERSION=2.33.20
RUN echo " Installing AWS CLI ${AWS_CLI_VERSION}" | tee -a /install.log
ADD https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${AWS_CLI_VERSION}.zip awscliv2.zip
RUN unzip awscliv2.zip \
  && aws/install \
  && rm -rf \
  awscliv2.zip \
  aws \
  /usr/local/aws-cli/v2/current/dist/aws_completer \
  /usr/local/aws-cli/v2/current/dist/awscli/data/ac.index \
  /usr/local/aws-cli/v2/current/dist/awscli/examples &&\
  find /usr/local/aws-cli/v2/current/dist/awscli/botocore/data -name examples-1.json -delete
# aws iam authenticator
# https://docs.aws.amazon.com/eks/latest/userguide/install-aws-iam-authenticator.html https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ECS_CLI_installation.html
ENV AWS_IAM_AUTHENTICATOR_VERSION=1.16.8
RUN echo " Installing AWS IAM Authenticator ${AWS_IAM_AUTHENTICATOR_VERSION}" | tee -a /install.log
ADD https://amazon-eks.s3.us-west-2.amazonaws.com/1.16.8/2020-04-16/bin/linux/amd64/aws-iam-authenticator ${OPT_BIN}/aws-iam-authenticator
RUN echo " Successfully installed AWS IAM Authenticator ${AWS_IAM_AUTHENTICATOR_VERSION}" | tee -a /install.log

RUN echo " Installing AWS ECS CLI" | tee -a /install.log
ADD https://s3.amazonaws.com/amazon-ecs-cli/ecs-cli-linux-amd64-latest ${OPT_BIN}/ecs-cli
RUN echo " Successfully installed AWS ECS CLI" | tee -a /install.log

RUN curl -ksS -L https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz | sudo tar xz -C ${OPT_BIN} &&\
  echo "Successfully installed AWS EKS CTL" | tee -a /install.log

RUN echo " Ensuring executable bit is set for AWS tools" | tee -a /install.log &&\
  sudo chmod +x ${OPT_BIN}/aws-iam-authenticator ${OPT_BIN}/ecs-cli ${OPT_BIN}/eksctl &&\
  echo "Success, executable bit is set for AWS tools" | tee -a /install.log

# aws session manager plugin
RUN echo " Installing AWS Session Manager Plugin" | tee -a /install.log
ADD https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb session-manager-plugin.deb
RUN sudo dpkg -i session-manager-plugin.deb && rm -f session-manager-plugin.deb &&\
  echo "Successfully installed AWS Session Manager Plugin" | tee -a /install.log

## kubectl
# https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/
ENV KUBECTL_VERSION=v1.35.3
RUN echo " Installing kubectl ${KUBECTL_VERSION}" | tee -a /install.log
ADD https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/amd64/kubectl kubectl
RUN chmod +x kubectl && mv kubectl ${OPT_BIN}/ &&\
  echo "Successfully installed kubectl ${KUBECTL_VERSION}" | tee -a /install.log

## kind
ENV KIND_VERSION=v0.31.0
RUN echo " Installing kind" | tee -a /install.log
ADD "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-amd64" kind
RUN chmod +x ./kind && mv ./kind ${OPT_BIN}/
RUN echo " Successfully installed kind" | tee -a /install.log

## helm
## https://kubernetes.io/releases/
ENV HELM_VERSION=v4.1.3
RUN echo " Installing helm ${HELM_VERSION}" | tee -a /install.log
ADD https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 get-helm-3
RUN chmod +x get-helm-3 &&\
  DESIRED_VERSION=$HELM_VERSION ./get-helm-3 &&\
  rm -f get-helm-3 &&\
  echo "Successfully installed helm ${HELM_VERSION}" | tee -a /install.log

## terraform
ENV TERRAFORM_VERSION=1.9.8
RUN echo " Installing helm ${HELM_VERSION}" | tee -a /install.log
ADD https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip terraform_${TERRAFORM_VERSION}_linux_amd64.zip
RUN unzip terraform_${TERRAFORM_VERSION}_linux_amd64.zip -d ${OPT_BIN} &&\
  rm -f terraform_${TERRAFORM_VERSION}_linux_amd64.zip

## packer
ENV PACKER_VERSION=1.1.0
RUN echo " Installing packer ${PACKER_VERSION}" | tee -a /install.log
ADD https://releases.hashicorp.com/packer/${PACKER_VERSION}/packer_${PACKER_VERSION}_linux_amd64.zip packer_${PACKER_VERSION}_linux_amd64.zip
RUN unzip packer_${PACKER_VERSION}_linux_amd64.zip -d ${OPT_BIN} &&\
  rm -f packer_${PACKER_VERSION}_linux_amd64.zip &&\
  echo "Successfully installed packer ${PACKER_VERSION}" | tee -a /install.log

## go ## golang
RUN git -c http.sslVerify=false clone https://github.com/syndbg/goenv.git $HOME/.goenv
ENV GOENV_DISABLE_GOPATH=1
ENV GOPATH="/go"
ARG GO_VERSION=1.23.2
ENV GO_VERSION=${GO_VERSION}
ENV PATH="/usr/local/go/bin:${PATH}"
RUN echo " Installing go ${GO_VERSION}" | tee -a /install.log &&\
  wget -P /tmp "https://dl.google.com/go/go${GO_VERSION}.linux-amd64.tar.gz" &&\
  tar -C /usr/local -xzf "/tmp/go${GO_VERSION}.linux-amd64.tar.gz" &&\
  rm "/tmp/go${GO_VERSION}.linux-amd64.tar.gz" &&\
  mkdir -p "$GOPATH/src" "$GOPATH/bin" && chmod -R 777 "$GOPATH" &&\
  echo "Successfully installed go ${GO_VERSION}" | tee -a /install.log

# Bitwarden cli
# RUN export VER=$(curl -H "Accept: application/vnd.github+json" https://api.github.com/repos/bitwarden/clients/releases | jq  -r 'sort_by(.published_at) | reverse | .[].name | select( index("CLI") )' | sed 's:.*CLI v::' | head -n 1) && \
ENV BW_VER=2023.4.0
RUN echo " Installing bitwarden cli ${BW_VER} & dependencies" | tee -a /install.log &&\
  apt update && apt install -y libsecret-1-0
ADD https://github.com/bitwarden/clients/releases/download/cli-v${BW_VER}/bw-linux-${BW_VER}.zip bw-linux-${BW_VER}.zip
RUN unzip bw-linux-${BW_VER}.zip &&\
  chmod +x ./bw &&\
  sudo mv bw ${OPT_BIN} &&\
  echo "Successfully installed Bitwarden cli ${BW_VER}" | tee -a /install.log

# gron
ENV GRON_VERSION=0.7.1
RUN echo " Installing gron ${GRON_VERSION}" | tee -a /install.log
ADD https://github.com/tomnomnom/gron/releases/download/v${GRON_VERSION}/gron-linux-amd64-${GRON_VERSION}.tgz /tmp/gron.tgz
RUN tar xzf /tmp/gron.tgz \
  && mv ./gron ${OPT_BIN}/ \
  && rm -f /tmp/gron.tgz &&\
  echo "Successfully installed gron ${GRON_VERSION}" | tee -a /install.log

# k9s
ENV K9S_VER=0.32.7
RUN echo " Installing k9s ${K9S_VER}" | tee -a /install.log
ADD https://github.com/derailed/k9s/releases/download/v${K9S_VER}/k9s_Linux_amd64.tar.gz /tmp/k9s.tar.gz
RUN tar xzf /tmp/k9s.tar.gz \
  && chmod +x k9s \
  && mv k9s ${OPT_BIN}/k9s \
  && rm -f /tmp/k9s.tar.gz &&\
  echo "Successfully installed k9s ${K9S_VER}" | tee -a /install.log

# kompose
ENV KOMPOSE_VERSION=v1.34.0
RUN echo " Installing kompose ${KOMPOSE_VERSION}" | tee -a /install.log
ADD https://github.com/kubernetes/kompose/releases/download/$KOMPOSE_VERSION/kompose-linux-amd64 ${OPT_BIN}/kompose
RUN chmod +x ${OPT_BIN}/kompose &&\
  echo "Successfully installed kompose ${KOMPOSE_VERSION}" | tee -a /install.log

RUN echo " Installing ssh keys for service user"  | tee -a /install.log &&\
  sudo su - $USER -c "mkdir -p $USERHOME/.ssh"

RUN echo " Installing Python modules"  | tee -a /install.log
ADD requirements.txt .
RUN pip3 install -r requirements.txt

RUN echo " Installing extra python modules"  | tee -a /install.log
ADD requirements.extras.txt .
RUN pip3 install -U -r requirements.extras.txt

RUN echo " Adjusting permissions for site-packages" | tee -a /install.log &&\
  chmod -R 777 /usr/local/lib/python3.13/site-packages

RUN echo " Cleaning up"  | tee -a /install.log &&\
  rm -rf $SETUP_HOME && apt-get clean

ARG DOCKER_VER=24.0
ARG BUILDX_VER=v0.21.1
RUN echo " Installing docker ... ${DOCKER_VER}"  | tee -a /install.log &&\
  install -m 0755 -d /etc/apt/keyrings &&\
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc &&\
  chmod a+r /etc/apt/keyrings/docker.asc &&\
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list &&\
  apt-get update &&\
  apt-get install -y docker-ce &&\
  apt-get purge -y docker-ce-rootless-extras docker-scan-plugin &&\
  apt-get autoremove -y &&\
  rm -rf /var/lib/apt/lists/* &&\
  curl -fsSL -o /tmp/docker-buildx "https://github.com/docker/buildx/releases/download/${BUILDX_VER}/buildx-${BUILDX_VER}.linux-amd64" &&\
  chmod +x /tmp/docker-buildx &&\
  usermod -aG docker $USER &&\
  mv /tmp/docker-buildx /usr/libexec/docker/cli-plugins/docker-buildx &&\
  echo "Successfully installed docker ${DOCKER_VER}"  | tee -a /install.log

# Set the container user
USER $USER

# Set the working directory
WORKDIR $USERHOME

# Create kubernetes directories
RUN mkdir ~/.kube

# miniconda
ENV PATH="/opt/conda/bin:$PATH"
ADD https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh miniconda.sh
RUN sudo /bin/bash miniconda.sh -b -p /opt/conda &&\
  rm -f miniconda.sh &&\
  sudo /opt/conda/bin/conda clean -pity &&\
  sudo ln -s /opt/conda/etc/profile.d/conda.sh /etc/profile.d/conda.sh &&\
  echo -e "\n. /opt/conda/etc/profile.d/conda.sh" >> ~/.zshrc &&\
  conda init zsh

# ansible collections
RUN echo " Installing ansible galaxy collections" | sudo tee -a /install.log
ADD requirements.ansible.yml .
RUN ansible-galaxy collection install -r requirements.ansible.yml &&\
  rm -f requirements.ansible.yml &&\
  echo "Successfully installed ansible galaxy collections"  | sudo tee -a /install.log &&\
  echo "Adding ansible.cfg" | sudo tee -a /install.log &&\
  sudo mkdir /etc/ansible
ADD ansible.cfg /etc/ansible/
RUN echo " Successfully added ansible.cfg" | sudo tee -a /install.log

# node version manager
ENV NVM_VERSION=v0.39.5
ENV NVM_HOME="${USERHOME}/.nvm"
ENV NVM_DIR="${USERHOME}/.nvm"
RUN echo " Installing node version manager (nvm) ${NVM_VERSION}" | sudo tee -a /install.log &&\
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash &&\
  echo "Successfully installed node version manager (nvm) ${NVM_VERSION}" | sudo tee -a /install.log

ENV NODE_VERSION=v22.14.0
RUN . "${NVM_HOME}/nvm.sh" &&\
  nvm install $NODE_VERSION &&\
  nvm alias default $NODE_VERSION &&\
  nvm use default

ARG OLLAMA_VERSION=0.20.0
ARG OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_HOST=${OLLAMA_HOST}
RUN echo "Installing ollama" | sudo tee -a /install.log &&\
  curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=$OLLAMA_VERSION sh &&\
  echo "Successfully installed ollama version ${OLLAMA_VERSION}" | sudo tee -a /install.log
RUN echo " Installing bash profile, et al, for service user"
COPY --chown=$USER:$GROUP .bash_profile $USERHOME
COPY --chown=$USER:$GROUP .bashrc $USERHOME
COPY --chown=$USER:$GROUP .inputrc $USERHOME
RUN echo " Successfully installed bash profile, et al, for service user" | sudo tee -a /install.log

RUN echo " Installing any ssh client settings if found"
COPY --chown=$USER:$GROUP authorized_keys* $USERHOME/.ssh
COPY --chown=$USER:$GROUP known_hosts $USERHOME/.ssh
COPY --chown=$USER:$GROUP id_rsa* $USERHOME/.ssh/
COPY --chown=$USER:$GROUP ssh.config $USERHOME/.ssh/config

RUN echo " Adjusting permissions for ssh keys and related objects if found"

RUN <<EOF /bin/bash
  chmod 700 $USERHOME/.ssh
  if [[ -f .ssh/authorized_keys ]];then
  chmod 644 $USERHOME/.ssh/authorized_keys
  fi &&\
  if [[ -f $USERHOME/.ssh/known_hosts ]];then
  chmod 644 $USERHOME/.ssh/known_hosts
  fi &&\
  if [[ -f $USERHOME/.ssh/config ]];then
  chmod 644 $USERHOME/.ssh/config
  fi &&\
  if [[ -f $USERHOME/.ssh/id_rsa ]];then
  chmod 600 $USERHOME/.ssh/id_rsa
  fi &&\
  if [[ -f $USERHOME/.ssh/id_rsa.pub ]];then
  chmod 644 $USERHOME/.ssh/id_rsa.pub
  fi
EOF

RUN echo " Adding default aws cli config file" | sudo tee -a /install.log
ADD .aws/config $USERHOME/.aws/config
RUN sudo chown -R $USER:$GROUP $USERHOME/.aws &&\
  echo "Successfully added default aws cli config file" | sudo tee -a /install.log

#allow services to start automatically from this point on
#https://askubuntu.com/questions/365911/why-the-services-do-not-start-at-installation
RUN printf '#!/bin/sh\nexit 0\n' | sudo tee /usr/sbin/policy-rc.d

# ohmyzsh
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
# Tell oh-my-zsh to ignore untracked git files
# see https://stackoverflow.com/questions/12765344/oh-my-zsh-slow-but-only-for-certain-git-repo
# see https://github.com/ohmyzsh/ohmyzsh/issues/5327
RUN git config --global --add oh-my-zsh.hide-dirty 1

COPY --chown=$USER:$GROUP .zshrc $USERHOME

ADD entrypoint.sh ${OPT_BIN}
RUN sudo chmod +x ${OPT_BIN}/entrypoint.sh

ENV ISDOCKER=true
ENV DOCKER_HOST_PORT=2375
ENV DOCKER_HOST=127.0.0.1:$DOCKER_HOST_PORT

EXPOSE 22
EXPOSE 5555
EXPOSE 17000

ENTRYPOINT ["entrypoint.sh"]
