#!/bin/bash

my_script_file_path=$0

function show_help(){

  echo $0
  local arg_pattern=$(cat "${my_script_file_path}" | egrep -i '(if \[\[ .\$arg)')
  echo -e "${arg_pattern}" | while read arg;do
    local pattern=$(cut -d@ -f1 <<< ${arg##*=~})
    local help_txt=$(cut -d@ -f2 <<< ${arg##*=~})
    echo " $pattern ${help_txt//]/}"
  done
}

if [[ "$*" =~ .*--help.* ]];then 
  show_help
  exit 0
fi

echo "$(date +%H:%M:%S.%s) Starting up ..."

if [[ ! -f ~/.ssh/id_rsa ]];then
  echo -n "$(date +%H:%M:%S.%s) Could not find any ssh keys under $USERHOME/.ssh, generating ... " | sudo tee -a /install.log
  ssh-keygen -f ~/.ssh/id_rsa -t rsa -N ''
  chmod 600 ~/.ssh/id_rsa*
  echo "done!" | sudo tee -a /install.log
fi

echo "Starting ollama server" | sudo tee -a /install.log
screen -dm ollama serve

MAX_RETRIES=60
RETRY_DELAY=1
echo "Waiting for Ollama server to be ready..." | sudo tee -a /install.log
for ((i=1; i<=MAX_RETRIES; i++)); do
    # Use curl with retry options to check the server status
    if curl --output /dev/null --silent --fail "$OLLAMA_HOST"; then
        echo "✅ Ollama is ready (Attempt $i)" | sudo tee -a /install.log
        break
    else
        echo "⏳ Attempt $i/$MAX_RETRIES failed. Retrying in $RETRY_DELAY seconds..." | sudo tee -a /install.log
        sleep $RETRY_DELAY
    fi

    # If all retries fail, exit with an error
    if [ "$i" -eq "$MAX_RETRIES" ]; then
        echo "❌ Ollama server failed to start after $MAX_RETRIES attempts." | sudo tee -a /install.log
        exit 1
    fi
done

find ~/.ai/models -maxdepth 1 -type d | while read modelName;do 
  modelFile="${modelName}/Modelfile"
  echo "Checking for ${modelFile}"
  if [[ -f "${modelFile}" ]];then 
    echo "Found Modelfile for ${modelName}"
    echo "Enabling ${modelName}"
    ollama create gemma-4-E2B-it-uncensored-Q8_0 -f "${modelFile}"
  fi
done

if [[ -n $EXTRA_OLLAMA_MODEL ]];then
  if $(ollama pull ${EXTRA_OLLAMA_MODEL}  2> >(sudo tee -a /install.log >&2));then
    echo "$(date +%H:%M:%S.%s) Successfully installed ${EXTRA_OLLAMA_MODEL}" | sudo tee -a /install.log
  else
    echo "$(date +%H:%M:%S.%s) Failed to pull ${EXTRA_OLLAMA_MODEL}" | sudo tee -a /install.log
  fi
fi

PREFIX=eval

for arg in "${@}";do
    shift
  if [[ "$arg" =~ ^--no-run-ssh$|^-no-ssh$|'@Do start SSH service - optional' ]]; then NO_RUN_SSH=true;continue;fi
  if [[ "$arg" =~ ^--dry$|'@Dry run, only echo commands' ]]; then PREFIX=echo;continue;fi
  set -- "$@" "$arg"
done

if [[ -z $NO_RUN_SSH ]];then
  echo "$(date +%H:%M:%S.%s) Exposing docker socket via ${DOCKER_HOST_PORT}" | sudo tee -a /install.log
  screen -dm sudo bash -c "(echo 'Exposing docker socket via socat ...';socat -d -d TCP-L:${DOCKER_HOST_PORT},fork UNIX:/var/run/docker.sock)"
  echo "$(date +%H:%M:%S.%s) Initialized SSH Service ..." | sudo tee -a /install.log
  screen -dm sudo /usr/sbin/sshd -D -o ListenAddress=0.0.0.0 | sudo tee -a /install.log
  echo "Container is ready"
  sleep infinity
  echo "$(date +%H:%M:%S.%s) Shutting down ..." | sudo tee -a /install.log
fi
