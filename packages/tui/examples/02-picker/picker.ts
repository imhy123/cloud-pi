import type { Component } from "@cloud-pi/tui";
import { initTheme, ProcessTerminal, TUI, matchesKey, truncateToWidth } from "@cloud-pi/tui";

class Picker implements Component {
  private index = 0;
  private readonly items = [
    "永和九年，岁在癸丑，暮春之初，会于会稽山阴之兰亭。群贤毕至，少长咸集。", 
    "However mean your life is, meet it and live it; do not shun it and call it hardnames.", 
    "午後の光が窓から差し込み、カフェには静かな音楽が流れています。新しい本を開いて、ゆっくりとページをめくります。",
    "창가에 따뜻한 햇살이 들어오고, 카페에는 잔잔한 음악이 흐릅니다. 새 책을 펼쳐 천천히 읽으며 여유로운 오후를 보냅니다."
  ];
  private readonly tui: TUI;
  private cachedWidth?: number;
  private cachedLines?: readonly string[];

  constructor(tui: TUI) {
    this.tui = tui;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "up")) {
      this.index = Math.max(0, this.index - 1);
    } else if (matchesKey(data, "down")) {
      this.index = Math.min(this.items.length - 1, this.index + 1);
    } else {
      return;
    }

    this.invalidate();
    this.tui.requestRender();
  }

  render(width: number): readonly string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.cachedWidth = width;
    this.cachedLines = this.items.map((item, i) => 
      truncateToWidth(`${i === this.index ? "> " : "  "}${item}`, width),
    );
    return this.cachedLines;
  }
}

await initTheme();

// Second argument: draw the caret with the terminal's hardware cursor instead of
// printing a cursor glyph into the frame, which would stay in scrollback on exit.
const tui = new TUI(new ProcessTerminal(), true);

const picker = new Picker(tui);
tui.addChild(picker);
tui.setFocus(picker);

tui.addInputListener(data => {
	if (matchesKey(data, "ctrl+c")) {
		tui.stop();
		process.exit(0);
	}
	return undefined;
});

tui.start();
