import { create } from 'zustand';

// Інструмент може бути рядком 'shovel', 'trash', або 'place_apple_tree', 'place_wheat' і тд.
export type ToolType = 'shovel' | 'trash' | 'move' | 'rotate' | string | null; 

interface ToolState {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: null,
  setActiveTool: (tool) => set({ activeTool: tool }),
}));