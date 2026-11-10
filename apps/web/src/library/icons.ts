/**
 * Built-in icon set for "icon" nodes. Each icon is drawn on a 24x24 grid with round
 * strokes (no fills), so it takes the node's stroke colour and works in both styles.
 * Icons are generic on purpose: no vendor logos or trademarks.
 */
export interface IconDef {
  readonly id: string;
  readonly name: string;
  readonly category: IconCategory;
  /** Extra search words. */
  readonly keywords: string;
  readonly paths: readonly string[];
}

export type IconCategory = "General" | "Cloud & infrastructure" | "Software" | "People & business";

export const ICON_CATEGORIES: readonly IconCategory[] = [
  "General",
  "Cloud & infrastructure",
  "Software",
  "People & business",
];

const circle = (cx: number, cy: number, r: number): string =>
  `M${String(cx - r)} ${String(cy)}a${String(r)} ${String(r)} 0 1 0 ${String(r * 2)} 0a${String(r)} ${String(r)} 0 1 0 ${String(-r * 2)} 0Z`;

export const ICONS: readonly IconDef[] = [
  // General
  {
    id: "star",
    name: "Star",
    category: "General",
    keywords: "favourite important",
    paths: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"],
  },
  {
    id: "check",
    name: "Done",
    category: "General",
    keywords: "tick complete success",
    paths: [circle(12, 12, 9), "M8 12.5l2.7 2.7L16.5 9"],
  },
  {
    id: "warning",
    name: "Warning",
    category: "General",
    keywords: "alert risk caution",
    paths: ["M12 3.5l9.5 16.5h-19z", "M12 10v4.5", "M12 17.5v.01"],
  },
  {
    id: "info",
    name: "Info",
    category: "General",
    keywords: "help note",
    paths: [circle(12, 12, 9), "M12 11v5.5", "M12 7.8v.01"],
  },
  {
    id: "clock",
    name: "Clock",
    category: "General",
    keywords: "time schedule deadline",
    paths: [circle(12, 12, 9), "M12 7v5l3.5 2"],
  },
  {
    id: "calendar",
    name: "Calendar",
    category: "General",
    keywords: "date event",
    paths: ["M4 6h16v14H4z", "M4 10h16", "M8 3.5v4", "M16 3.5v4"],
  },
  {
    id: "flag",
    name: "Flag",
    category: "General",
    keywords: "milestone goal",
    paths: ["M5 21V4", "M5 4h12l-2.5 4L17 12H5"],
  },
  {
    id: "lightbulb",
    name: "Idea",
    category: "General",
    keywords: "lightbulb insight",
    paths: ["M9 18h6", "M10 21h4", "M8.5 14.5a6 6 0 1 1 7 0c-.9.7-1.5 1.6-1.5 2.5h-4c0-.9-.6-1.8-1.5-2.5z"],
  },
  {
    id: "mail",
    name: "Email",
    category: "General",
    keywords: "message envelope notification",
    paths: ["M3.5 6h17v12h-17z", "M3.5 6.5l8.5 6.5 8.5-6.5"],
  },
  {
    id: "bell",
    name: "Notification",
    category: "General",
    keywords: "bell alert",
    paths: ["M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z", "M10 20.5h4"],
  },
  {
    id: "search",
    name: "Search",
    category: "General",
    keywords: "find magnifier",
    paths: [circle(10.5, 10.5, 6.5), "M15.5 15.5L20 20"],
  },
  {
    id: "gear",
    name: "Settings",
    category: "General",
    keywords: "gear config cog",
    paths: [
      circle(12, 12, 3),
      "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
    ],
  },
  {
    id: "file",
    name: "File",
    category: "General",
    keywords: "document page",
    paths: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M9 12h6M9 16h6"],
  },
  {
    id: "folder",
    name: "Folder",
    category: "General",
    keywords: "directory",
    paths: ["M3 6h6l2 2h10v11H3z"],
  },
  {
    id: "lock",
    name: "Secure",
    category: "General",
    keywords: "lock security private auth",
    paths: ["M6 11h12v10H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3", "M12 15v2.5"],
  },
  {
    id: "key",
    name: "Key",
    category: "General",
    keywords: "secret credential access",
    paths: [circle(8, 14, 4), "M11 11l9-9", "M17 5l2 2", "M15 7l2 2"],
  },

  // Cloud & infrastructure
  {
    id: "server",
    name: "Server",
    category: "Cloud & infrastructure",
    keywords: "host machine vm compute",
    paths: ["M4 4h16v7H4z", "M4 13h16v7H4z", "M7.5 7.5h.01M7.5 16.5h.01", "M11 7.5h6M11 16.5h6"],
  },
  {
    id: "database",
    name: "Database",
    category: "Cloud & infrastructure",
    keywords: "db sql storage data",
    paths: [
      "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z",
      "M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6",
      "M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "Cloud & infrastructure",
    keywords: "internet hosting saas",
    paths: ["M7 18a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17.5 18z"],
  },
  {
    id: "container",
    name: "Container",
    category: "Cloud & infrastructure",
    keywords: "docker image pod box",
    paths: ["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M4 7.5l8 4.5 8-4.5", "M12 12v9"],
  },
  {
    id: "function",
    name: "Function",
    category: "Cloud & infrastructure",
    keywords: "serverless lambda compute",
    paths: ["M4 4h16v16H4z", "M14.5 7.5c-2 0-2.5 1-2.8 3l-1 4c-.3 1.6-.9 2-2.2 2", "M9 11h6"],
  },
  {
    id: "queue",
    name: "Queue",
    category: "Cloud & infrastructure",
    keywords: "message bus stream topic events",
    paths: ["M3 8h18v8H3z", "M7.5 8v8M12 8v8M16.5 8v8"],
  },
  {
    id: "bucket",
    name: "Object storage",
    category: "Cloud & infrastructure",
    keywords: "bucket blob files s3",
    paths: [
      "M4 6c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5-3.6 2.5-8 2.5S4 7.4 4 6z",
      "M4 6l2 13c.2 1 2.8 2 6 2s5.8-1 6-2l2-13",
    ],
  },
  {
    id: "load-balancer",
    name: "Load balancer",
    category: "Cloud & infrastructure",
    keywords: "proxy traffic distribute",
    paths: [
      circle(12, 5.5, 2.5),
      circle(5, 18.5, 2.5),
      circle(12, 18.5, 2.5),
      circle(19, 18.5, 2.5),
      "M12 8v8M10.5 7.5L6 16.3M13.5 7.5L18 16.3",
    ],
  },
  {
    id: "cdn",
    name: "CDN",
    category: "Cloud & infrastructure",
    keywords: "edge cache globe network",
    paths: [
      circle(12, 12, 9),
      "M3 12h18",
      "M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z",
    ],
  },
  {
    id: "gateway",
    name: "API gateway",
    category: "Cloud & infrastructure",
    keywords: "api entry router ingress",
    paths: ["M3 12h5", "M16 12h5", "M8 6h8v12H8z", "M11 9.5l2 2.5-2 2.5"],
  },
  {
    id: "firewall",
    name: "Firewall",
    category: "Cloud & infrastructure",
    keywords: "security wall network shield",
    paths: ["M3 5h18v14H3z", "M3 9.7h18M3 14.3h18", "M9 5v4.7M15 9.7v4.6M9 14.3V19"],
  },
  {
    id: "network",
    name: "Network",
    category: "Cloud & infrastructure",
    keywords: "vpc subnet switch topology",
    paths: ["M9 3h6v5H9z", "M3 16h6v5H3z", "M15 16h6v5h-6z", "M12 8v4M6 16v-4h12v4"],
  },
  {
    id: "cluster",
    name: "Cluster",
    category: "Cloud & infrastructure",
    keywords: "orchestration nodes kubernetes",
    paths: [
      "M12 2.5l8.3 4.8v9.4L12 21.5l-8.3-4.8V7.3z",
      circle(12, 12, 3),
      "M12 5.5V9M12 15v3.5M6.4 8.8l3 1.7M14.6 13.5l3 1.7M6.4 15.2l3-1.7M14.6 10.5l3-1.7",
    ],
  },
  {
    id: "monitor",
    name: "Monitoring",
    category: "Cloud & infrastructure",
    keywords: "metrics observability dashboard chart",
    paths: ["M3 4h18v13H3z", "M8 21h8M12 17v4", "M6.5 13l3-3.5 2.5 2 4-5"],
  },

  // Software
  {
    id: "browser",
    name: "Web app",
    category: "Software",
    keywords: "browser website frontend client",
    paths: ["M3 5h18v14H3z", "M3 9h18", "M6 7h.01M8.5 7h.01"],
  },
  {
    id: "mobile",
    name: "Mobile app",
    category: "Software",
    keywords: "phone ios android client",
    paths: ["M7 2.5h10v19H7z", "M11 18.5h2"],
  },
  {
    id: "laptop",
    name: "Desktop",
    category: "Software",
    keywords: "laptop computer client",
    paths: ["M5 5h14v10H5z", "M2.5 19h19l-2-4h-15z"],
  },
  {
    id: "code",
    name: "Code",
    category: "Software",
    keywords: "source repo developer",
    paths: ["M8.5 7L3.5 12l5 5", "M15.5 7l5 5-5 5", "M13.5 4.5l-3 15"],
  },
  {
    id: "terminal",
    name: "Terminal",
    category: "Software",
    keywords: "cli shell console script",
    paths: ["M3 4h18v16H3z", "M7 9l3 3-3 3", "M12.5 15H17"],
  },
  {
    id: "api",
    name: "API",
    category: "Software",
    keywords: "plug integration endpoint interface",
    paths: ["M9 7V3M15 7V3", "M6 7h12v4a6 6 0 0 1-12 0z", "M12 17v4"],
  },
  {
    id: "bug",
    name: "Bug",
    category: "Software",
    keywords: "defect issue error",
    paths: [
      "M8 9h8v6a4 4 0 0 1-8 0z",
      "M9.5 9a2.5 2.5 0 0 1 5 0",
      "M4 12h4M16 12h4M5 7l3 2M19 7l-3 2M5 18l3-2M19 18l-3-2",
    ],
  },
  {
    id: "branch",
    name: "Branch",
    category: "Software",
    keywords: "git version control merge",
    paths: [
      circle(6, 5, 2.2),
      circle(6, 19, 2.2),
      circle(18, 7, 2.2),
      "M6 7.2v9.6",
      "M18 9.2c0 4-6 3.5-11 7.5",
    ],
  },
  {
    id: "package",
    name: "Package",
    category: "Software",
    keywords: "library module release artifact",
    paths: [
      "M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z",
      "M3.5 7.5L12 12l8.5-4.5",
      "M12 12v9",
      "M7.8 5.3l8.4 4.6",
    ],
  },
  {
    id: "robot",
    name: "Automation",
    category: "Software",
    keywords: "bot ai job worker",
    paths: [
      "M5 8h14v11H5z",
      "M12 4v4",
      circle(12, 3.5, 1),
      "M9 13h.01M15 13h.01",
      "M9.5 16h5",
      "M2.5 12v3M21.5 12v3",
    ],
  },
  {
    id: "sync",
    name: "Sync",
    category: "Software",
    keywords: "refresh replicate integration",
    paths: [
      "M4.5 10a7.5 7.5 0 0 1 13.4-3.5L20 9",
      "M20 4v5h-5",
      "M19.5 14a7.5 7.5 0 0 1-13.4 3.5L4 15",
      "M4 20v-5h5",
    ],
  },

  // People & business
  {
    id: "user",
    name: "Person",
    category: "People & business",
    keywords: "user customer actor account",
    paths: [circle(12, 8, 4), "M4 21a8 8 0 0 1 16 0"],
  },
  {
    id: "users",
    name: "Team",
    category: "People & business",
    keywords: "group people users",
    paths: [
      circle(9, 8, 3.5),
      "M2.5 20a6.5 6.5 0 0 1 13 0",
      "M15.5 4.8a3.5 3.5 0 0 1 0 6.4",
      "M17.5 14a6.5 6.5 0 0 1 4 6",
    ],
  },
  {
    id: "phone",
    name: "Phone",
    category: "People & business",
    keywords: "telephone call number handset",
    paths: [
      "M6.5 3.5l3 .5 1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5.5 3c0 1-1 2-2 2C11 19.5 4.5 13 4.5 5.5c0-1 1-2 2-2z",
    ],
  },
  {
    id: "car",
    name: "Vehicle",
    category: "People & business",
    keywords: "car vehicle van truck transport",
    paths: ["M3 16v-4l2-5h14l2 5v4z", "M3 12h18", circle(7, 17.5, 1.8), circle(17, 17.5, 1.8)],
  },
  {
    id: "pin",
    name: "Location",
    category: "People & business",
    keywords: "place address map marker where",
    paths: ["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z", circle(12, 9.5, 2.5)],
  },
  {
    id: "building",
    name: "Company",
    category: "People & business",
    keywords: "office organisation building",
    paths: ["M5 21V4h9v17", "M14 9h5v12", "M3 21h18", "M8 8h3M8 12h3M8 16h3"],
  },
  {
    id: "cart",
    name: "Shop",
    category: "People & business",
    keywords: "cart ecommerce order checkout",
    paths: ["M3 4h2.5l2.2 11h10.6l2-8H6.5", circle(9, 19, 1.5), circle(17, 19, 1.5)],
  },
  {
    id: "card",
    name: "Payment",
    category: "People & business",
    keywords: "credit card billing money",
    paths: ["M3 6h18v12H3z", "M3 10h18", "M7 14.5h4"],
  },
  {
    id: "chart",
    name: "Report",
    category: "People & business",
    keywords: "analytics chart bar metrics",
    paths: ["M4 20h16", "M7 16v-5", "M12 16V7", "M17 16v-8"],
  },
  {
    id: "chat",
    name: "Chat",
    category: "People & business",
    keywords: "message conversation support",
    paths: ["M4 5h16v11H9l-5 4z"],
  },
  {
    id: "target",
    name: "Goal",
    category: "People & business",
    keywords: "target objective okr",
    paths: [circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1)],
  },
];

const byId = new Map(ICONS.map((icon) => [icon.id, icon]));

export function getIcon(id: string | null): IconDef | undefined {
  return id ? byId.get(id) : undefined;
}

/** Case-insensitive search over icon names, categories and keywords. */
export function searchIcons(query: string): IconDef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...ICONS];
  return ICONS.filter((icon) => {
    const haystack = `${icon.name} ${icon.category} ${icon.keywords} ${icon.id}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
