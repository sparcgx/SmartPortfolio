import type { ThemeId } from "./types";

export const THEMES: Record<
  ThemeId,
  { id: ThemeId; name: string; subtitle: string; swatch: string }
> = {
  dark: {
    id: "dark",
    name: "極客暗黑",
    subtitle: "科技深灰與靛藍",
    swatch: "bg-indigo-500",
  },
  light: {
    id: "light",
    name: "極簡明亮",
    subtitle: "清爽白色與深色字",
    swatch: "bg-indigo-600",
  },
  navy: {
    id: "navy",
    name: "深藍夜空",
    subtitle: "沉穩海藍金融風格",
    swatch: "bg-cyan-500",
  },
  emerald: {
    id: "emerald",
    name: "翡翠金融",
    subtitle: "專業翡翠綠黑風格",
    swatch: "bg-emerald-500",
  },
};

// Used only for the one-time v1.0 migration so existing browsers can remove
// the original sample rows without touching records created by the user.
export const LEGACY_DEMO_HOLDINGS = new Map([
  ["1", "2330"],
  ["2", "0050"],
  ["3", "00878"],
  ["4", "NVDA"],
  ["5", "AAPL"],
  ["6", "F001"],
]);

export const LEGACY_DEMO_TRANSACTIONS = new Set(["t1", "t2", "t3", "t4"]);
