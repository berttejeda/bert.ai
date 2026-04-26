import os

import pyaudio
import speech_recognition as sr
from openai import OpenAI
from piper import PiperVoice
from rich.console import Console
from rich.markdown import Markdown

OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_MODEL = "gemma-4-E2B-it-uncensored-Q8_0"
WHISPER_MODEL = "base"  # tiny, base, small, medium, large
PIPER_MODEL = "~/.local/share/piper/en_US-lessac-medium.onnx"


def listen() -> str:
    """Capture audio from the microphone and transcribe with local Whisper."""
    recognizer = sr.Recognizer()
    recognizer.pause_threshold = 2.0        # seconds of silence before stopping (default 0.8)
    recognizer.phrase_threshold = 0.3       # min seconds of speech to consider valid
    recognizer.non_speaking_duration = 1.5  # silence kept in buffer (should be <= pause_threshold)
    with sr.Microphone() as source:
        print("Adjusting for ambient noise … ", end="", flush=True)
        recognizer.adjust_for_ambient_noise(source, duration=1)
        print("done.")
        print("🎤 Speak your prompt (pause 2s to finish):")
        audio = recognizer.listen(source)

    print("Transcribing with Whisper …")
    text = recognizer.recognize_whisper(audio, model=WHISPER_MODEL, language="english")
    return text.strip()


def ask_ollama(prompt: str) -> str:
    """Send a prompt to the local Ollama instance and return the response."""
    client = OpenAI(base_url=OLLAMA_BASE_URL, api_key="unused")
    resp = client.chat.completions.create(
        model=OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def main():
    try:
        prompt = listen()
    except sr.UnknownValueError:
        print("Could not understand the audio. Please try again.")
        return
    except sr.RequestError as e:
        print(f"Whisper error: {e}")
        return

    print(f"\n📝 You said: {prompt}\n")
    print("Thinking …\n")
    answer = ask_ollama(prompt)
    console = Console()
    console.print(Markdown(answer))
    speak(answer)


def speak(text: str) -> None:
    """Speak text aloud using Piper neural TTS (streaming raw PCM)."""
    model_path = os.path.expanduser(PIPER_MODEL)
    voice = PiperVoice.load(model_path)

    pa = pyaudio.PyAudio()
    stream = pa.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=voice.config.sample_rate,
        output=True,
    )
    for chunk in voice.synthesize(text):
        stream.write(chunk.audio_int16_bytes)
    stream.stop_stream()
    stream.close()
    pa.terminate()


if __name__ == "__main__":
    main()