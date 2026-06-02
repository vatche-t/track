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
};
