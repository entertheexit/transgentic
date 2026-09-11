class SoundFxEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    // Lazy initialize on first interaction to comply with autoplay policies
  }

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Tactile mechanical switch click (sharp transient).
   */
  public playClick(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  }

  /**
   * Mode switch sound (harmonic pitch glide).
   */
  public playModeSwitch(modeIndex: number = 0): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // 5 distinct ascending harmonic frequencies for each mode:
    // 0: General (523.25 Hz - C5)
    // 1: Coding (659.25 Hz - E5)
    // 2: Image (783.99 Hz - G5)
    // 3: Video (987.77 Hz - B5)
    // 4: Audio (1318.51 Hz - E6, distinct high crystalline resonant tone)
    const frequencies = [523.25, 659.25, 783.99, 987.77, 1318.51];
    const freq = frequencies[modeIndex % frequencies.length];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = modeIndex === 4 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.15, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  /**
   * Completion chime (dual bell resonance).
   */
  public playSuccessChime(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    [880, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);

      gain.gain.setValueAtTime(0.09, ctx.currentTime + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + i * 0.06);
      osc.stop(ctx.currentTime + i * 0.06 + 0.25);
    });
  }

  /**
   * Subtle alert / fallback warn tone.
   */
  public playWarnTone(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.setValueAtTime(240, ctx.currentTime + 0.07);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  /**
   * Smooth drawer slide sound.
   */
  public playDrawerSlide(): void {
    this.playClick();
  }

  /**
   * Task completion alias.
   */
  public playTaskSuccess(): void {
    this.playSuccessChime();
  }

  public playSuccess(): void {
    this.playSuccessChime();
  }
}

export const soundFx = new SoundFxEngine();
