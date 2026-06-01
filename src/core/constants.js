export const C = {
  // backgrounds — 3 clear layers
  bg:       "#080812",
  surface:  "#10101e",
  card:     "#14142a",
  raised:   "#1c1c38",
  cardHi:   "#1f1f3a",

  // borders
  border:   "#252540",
  borderHi: "#38385a",

  // text
  text:     "#eeeef6",
  textDim:  "#9898bc",
  muted:    "#5e5e80",

  // accents
  green:    "#34d4a4",
  blue:     "#38bdf8",
  amber:    "#e9c46a",
  red:      "#f07178",
  purple:   "#a78bfa",

  // special surfaces
  glass:    "rgba(255,255,255,0.03)",
  overlay:  "rgba(8,8,18,0.82)",
  parchment:"#ede3cc",
  ink:      "#1b1b28",

  // glow
  glow:     "rgba(52,212,164,0.18)",
};
export const CATEGORY_OPTIONS = [
  "Work",
  "Personal",
  "Health",
  "Learning",
  "Admin",
  "Finance",
  "Other",
];
export const PRIORITIES = ["High", "Medium", "Low"];
export const STATUSES = ["To Do", "In Progress", "Done", "Cancelled"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const RATING = [1, 2, 3, 4, 5];
export const CHART_COLORS = [C.green, C.blue, C.amber, C.red, C.purple];
export const PRIORITY_COLOR = { High: C.red, Medium: C.amber, Low: C.green };
export const STATUS_COLOR = {
  Done: C.green,
  "In Progress": C.blue,
  "To Do": C.muted,
  Cancelled: C.red,
};
