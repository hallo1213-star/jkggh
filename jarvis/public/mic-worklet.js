// Converts microphone audio to 16-bit PCM and posts it in ~40 ms chunks.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.04);
    this.buffer = new Int16Array(this.size);
    this.index = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.index++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        if (this.index === this.size) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(this.size);
          this.index = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('mic-capture', MicCapture);
