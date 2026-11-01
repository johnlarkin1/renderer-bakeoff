import type { View } from "./scene";

export interface Renderer {
  name: string;
  setView(v: View): void;
  render(): void; // synchronous draw/submit of one frame
  visibleItems(): number;
  destroy(): void;
}
