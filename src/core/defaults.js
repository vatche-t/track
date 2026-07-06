import { localDate, uid } from "./date";
import {
  DEFAULT_SAVINGS_FUNDS,
  FINANCE_CATEGORIES,
  STARTER_EXPENSES,
} from "./finance";

export const DEFAULTS = {
  tasks: [
    {
      id: uid(),
      date: localDate(),
      title: "Review project proposal",
      category: "Work",
      priority: "High",
      status: "Done",
      est: 60,
      actual: 50,
    },
    {
      id: uid(),
      date: localDate(),
      title: "Morning workout",
      category: "Health",
      priority: "Medium",
      status: "To Do",
      est: 45,
      actual: 0,
      recurring: true,
    },
    {
      id: uid(),
      date: localDate(),
      title: "Read 20 pages",
      category: "Learning",
      priority: "Low",
      status: "In Progress",
      est: 30,
      actual: 15,
    },
  ],
  recurringTemplates: [
    {
      id: uid(),
      title: "Morning workout",
      category: "Health",
      priority: "Medium",
      est: 45,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
    {
      id: uid(),
      title: "Check emails",
      category: "Work",
      priority: "High",
      est: 20,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
  ],
  routines: [
    { id: uid(), name: "Wake up", time: "06:00", block: "Morning", done: true },
    { id: uid(), name: "Workout", time: "06:10", block: "Morning", done: true },
    {
      id: uid(),
      name: "Plan the day",
      time: "07:20",
      block: "Morning",
      done: false,
    },
    { id: uid(), name: "Read", time: "21:30", block: "Evening", done: false },
  ],
  goals: [
    {
      id: uid(),
      title: "Land new job",
      category: "Career",
      target: "2026-06-30",
      status: "In Progress",
      priority: "High",
      progress: 65,
    },
    {
      id: uid(),
      title: "Read 24 books",
      category: "Personal",
      target: "2026-12-31",
      status: "In Progress",
      priority: "Low",
      progress: 42,
    },
  ],
  habits: [
    { id: uid(), name: "Workout", target: 5, log: {} },
    { id: uid(), name: "Read 20 pages", target: 7, log: {} },
    { id: uid(), name: "Meditate", target: 7, log: {} },
  ],
  finance: {
    income: [
      {
        id: uid(),
        name: "Senior AI Engineer salary",
        budget: 1200000,
        actual: 1200000,
      },
    ],
    fixed: [
      { id: uid(), name: "Rent", budget: 90000, actual: 90000 },
      { id: uid(), name: "Utilities", budget: 30000, actual: 30000 },
    ],
    variable: [
      { id: uid(), name: "Groceries", budget: 20000, actual: 0 },
      { id: uid(), name: "Transport", budget: 18000, actual: 0 },
      { id: uid(), name: "Eating out", budget: 43000, actual: 0 },
      { id: uid(), name: "Cigarettes", budget: 13500, actual: 0 },
    ],
    savings: DEFAULT_SAVINGS_FUNDS,
    expenses: STARTER_EXPENSES,
    categories: FINANCE_CATEGORIES,
    seededStarterExpenses: true,
    seededCoreSavingsFunds: true,
  },
  reviews: [],
  // Study/health roadmap — checkable milestones grouped by track. Dates are
  // "exam-ready / target" dates from the researched plan (see productivity-plan).
  roadmap: [
    // ── AWS Certifications ──
    { id: "rm-mla-course", track: "AWS Certifications", title: "Finish MLA-C01 Udemy course + hands-on labs", target: "2026-09-07", done: false, note: "~9 weeks at 30 min/day. Don't skip the SageMaker labs." },
    { id: "rm-mla-prep", track: "AWS Certifications", title: "MLA-C01 practice exams → hit 80%+", target: "2026-09-21", done: false, note: "Tutorials Dojo / official practice. Book the exam once here." },
    { id: "rm-mla-exam", track: "AWS Certifications", title: "🎓 Sit AWS ML Engineer Associate (MLA-C01)", target: "2026-09-28", done: false, note: "$150 · 65 Q · 130 min · pass 720/1000." },
    { id: "rm-saa-course", track: "AWS Certifications", title: "SAA-C03 course + labs (reuses MLA plumbing)", target: "2026-11-16", done: false, note: "VPC, IAM, S3, EC2, HA, cost. Moves faster after MLA." },
    { id: "rm-saa-prep", track: "AWS Certifications", title: "SAA-C03 practice exams → 80%+", target: "2026-12-07", done: false, note: "Huge practice-exam ecosystem — lean on it." },
    { id: "rm-saa-exam", track: "AWS Certifications", title: "🎓 Sit AWS Solutions Architect Associate (SAA-C03)", target: "2026-12-14", done: false, note: "2-week buffer before year-end." },
    { id: "rm-genai", track: "AWS Certifications", title: "AIP-C01 GenAI Developer Professional (2027 stretch)", target: "2027-04-30", done: false, note: "Pro-tier; needs real Bedrock/agent hours first. Not a 2026 goal." },
    // ── Hardware / Edge-AI ──
    { id: "rm-hw-fund", track: "Hardware / Edge-AI", title: "Electronics fundamentals — PEFI 4th ed ch.1-4 + breadboard", target: "2026-08-15", done: false, note: "Reference-read, not cover-to-cover. Goal: read a schematic + use a multimeter." },
    { id: "rm-hw-flash", track: "Hardware / Edge-AI", title: "Flash first ESP32-S3 (blink, camera + mic to serial)", target: "2026-09-05", done: false, note: "Seeed XIAO ESP32-S3 Sense. Arduino core — skips the Uno phase." },
    { id: "rm-hw-sensors", track: "Hardware / Edge-AI", title: "Sensors over I²C/SPI/UART (MPU6050 + BME280 + SD log)", target: "2026-09-30", done: false, note: "Minimum comms depth before Edge Impulse. CAN/LoRa deferred." },
    { id: "rm-hw-tinyml", track: "Hardware / Edge-AI", title: "🤖 First TinyML model deployed on ESP32-S3 (Edge Impulse)", target: "2026-11-08", done: false, note: "Coursera 'Intro to Embedded ML'. Keyword-spotting or image classification." },
    { id: "rm-hw-tflm", track: "Hardware / Edge-AI", title: "Raw TensorFlow Lite Micro deploy (no Edge Impulse SDK)", target: "2026-12-20", done: false, note: "Understand the runtime, memory arena, quantization." },
    { id: "rm-hw-comms", track: "Hardware / Edge-AI", title: "Comms backfill: CAN + LoRa (2027)", target: "2027-02-15", done: false, note: "MCP2515 CAN + RFM95/Heltec LoRa between two ESP32s." },
    { id: "rm-hw-pcb", track: "Hardware / Edge-AI", title: "Design a custom board in KiCad + order from JLCPCB (2027)", target: "2027-05-01", done: false, note: "Productionization skill, not a prerequisite." },
    { id: "rm-hw-capstone", track: "Hardware / Edge-AI", title: "🏁 Capstone: custom PCB + on-device AI, deployed (2027)", target: "2027-07-31", done: false, note: "The full fundamentals→edge-AI→production proof piece." },
    // ── Fat Loss (110 → 90 kg, then 85 stretch) ──
    { id: "rm-fat-base", track: "Fat Loss", title: "Baseline weigh-in ~110 kg + start deficit", target: "2026-07-06", done: false, note: "500-750 kcal deficit, protein 175-200 g, keep 16:8, resistance 3x/wk, 8-10k steps." },
    { id: "rm-fat-aug", track: "Fat Loss", title: "Checkpoint: 107 kg", target: "2026-08-06", done: false, note: "" },
    { id: "rm-fat-sep", track: "Fat Loss", title: "Checkpoint: 104.5 kg (≈5% down)", target: "2026-09-06", done: false, note: "" },
    { id: "rm-fat-oct", track: "Fat Loss", title: "Checkpoint: 102 kg", target: "2026-10-06", done: false, note: "" },
    { id: "rm-fat-nov", track: "Fat Loss", title: "Checkpoint: break 100 kg", target: "2026-11-06", done: false, note: "Consider a 1-2 week diet break if adherence dips." },
    { id: "rm-fat-dec", track: "Fat Loss", title: "Checkpoint: 98 kg", target: "2026-12-06", done: false, note: "Rate naturally slows — expected and healthy." },
    { id: "rm-fat-goal", track: "Fat Loss", title: "🎯 Reach 90 kg (−20 kg)", target: "2027-05-06", done: false, note: "Then maintenance before pushing to 85 kg stretch (~Sep 2027)." },
  ],
};
