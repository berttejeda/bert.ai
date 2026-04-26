import json
import requests
import base64

from btconfig import Config

# Supress Insecure SSL Warning
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Replace these
default_jenkins_url = "https://jenkins.webex.umi.ai"

# Create a function to process command-line arguments/parameters
def arg_parser():
    parser = argparse.ArgumentParser(
    description="Jenkins Job Trigger - Triggers a Jenkins Job from your terminal!", formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument('--config', '-c', required=False, default=os.environ.get('JENKINS_TRIGGER_CONFIG', 'config.yaml'), help='Specify script config file')
    parser.add_argument('--api-token', '-t', required=False, default=os.environ.get('JENKINS_API_TOKEN'), help='Specify the Jenkins API Token for the session')
    parser.add_argument('--username', '-u', required=True, help='Specify the username for the session')
    parser.add_argument('--jenkins-url', '-j', required=False, default=default_jenkins_url, help='Override the Jenkins URL')
    parser.add_argument('--job-name', '-jn', required=True, help='Specify the job name, e.g. pull-local')
    parser.add_argument('--target-module', '-m', required=True, help='Specify the BTP Module Name')
    parser.add_argument('--target-module-version', '-mv', required=False, help='Specify the BTP Module Version')
    parser.add_argument('--socks-proxy-address', '-xh', required=False, help='Specify SocksV5 Proxy Address')
    parser.add_argument('--socks-proxy-port', '-xp', required=False, help='Specify SocksV5 Proxy Port')
    parser.add_argument('--socks-proxy-credentials', '-xc', required=False, help='Specify SocksV5 Proxy Credentials, e.g. username:password')
    parser.add_argument('--verify-tls', action='store_true', default=False, required=False)
    parser.add_argument('--debug', '-D', action='store_true', required=False)
    parser.add_argument('--verbose', '-v', action='store_true', required=False)
    return parser

# Capture command-line arguments/parameters from parse_args function
args, unknown = arg_parser().parse_known_args()
config_file = args.config
config = Config(config_file_uri=config_file)
credentials = config['credentials']

    def get_access_token(self):
        credentials = f"{self.credentials['CLIENT_ID']}:{self.credentials['CLIENT_SECRET']}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {encoded_credentials}"
        }
        data = {"grant_type": "client_credentials"}

        try:
            response = requests.post(self.config['token_url'], headers=headers, data=data)
            response.raise_for_status()
            return response.json().get("access_token")
        except requests.exceptions.HTTPError as e:
            raise RuntimeError(f"HTTP error while obtaining access token: {e} - {response.text}")

    def process_text(self, text, task_sequence):
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "api-key": self.get_access_token()
        }

        system_prompt = "You are a software engineer creating concise, engineering-focused titles."

        for task in task_sequence:
            prompt = {
                "translate": "Translate the following text to English with technical clarity.",
                "summary": "Create a complete, concise title under 10 words focusing on key engineering objectives.",
                "rewrite": "Rewrite the following text clearly and concisely, focusing on key technical objectives."
            }.get(task)

            payload = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text.strip()}
                ],
                "user": json.dumps({"appkey": self.credentials['appkey']})
            }

            try:
                response = requests.post(self.config['ai_api_url'], headers=headers, json=payload)
                response.raise_for_status()
                choices = response.json().get("choices", [])
                if choices:
                    text = choices[0].get("message", {}).get("content", "").strip()
                else:
                    raise RuntimeError(f"{task.capitalize()} unavailable from AI service.")
            except requests.exceptions.HTTPError as e:
                raise RuntimeError(f"HTTP error: {e} - {response.text}")

        return text

    def translate_and_summarize(self, text):
        return self.process_text(text, ["translate", "summary", "rewrite"])