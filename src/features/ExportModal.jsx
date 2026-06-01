import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button, Card } from "../components/ui";
import {
  addDays,
  dateRange,
  habitStreak,
  localDate,
  parseDate,
  startOfWeekISO,
} from "../core/date";
import { financeTotals, normalizeFinance } from "../core/finance";

export function ExportModal({ data, setters, onClose }) {
  const [message, setMessage] = useState("");
  const exportAll = () => {
    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      ...data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tracker-backup-" + localDate() + ".json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  };
  const addSheet = (workbook, name, rows) => {
    const worksheet = workbook.addWorksheet(name);
    const keys = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set()),
    );
    worksheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.min(36, Math.max(12, key.length + 4)),
    }));
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF252934" },
    };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    if (keys.length)
      worksheet.autoFilter = {
        from: "A1",
        to: worksheet.getColumn(keys.length).letter + "1",
      };
  };
  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tracker";
    workbook.created = new Date();
    const finance = normalizeFinance(data.finance);
    const financeSummary = financeTotals(finance);
    addSheet(
      workbook,
      "Tasks",
      data.tasks.map((task) => ({
        Date: task.date,
        Title: task.title,
        Category: task.category,
        Priority: task.priority,
        Status: task.status,
        "Est Min": task.est || 0,
        "Actual Min": task.actual || 0,
        Recurring: task.recurring ? "Yes" : "No",
        Notes: task.notes || "",
        Subtasks: (task.subtasks || [])
          .map((subtask) => (subtask.done ? "[x] " : "[ ] ") + subtask.title)
          .join("\n"),
      })),
    );
    addSheet(
      workbook,
      "Habits",
      data.habits.map((habit) => ({
        Habit: habit.name,
        "Weekly Target": habit.target || 7,
        "Current Streak": habitStreak(habit),
        "Done Days": Object.values(habit.log || {}).filter(Boolean).length,
      })),
    );
    addSheet(
      workbook,
      "Routine",
      data.routines.map((routine) => ({
        Block: routine.block,
        Time: routine.time,
        Name: routine.name,
        Done: routine.done ? "Yes" : "No",
      })),
    );
    addSheet(
      workbook,
      "Goals",
      data.goals.map((goal) => ({
        Title: goal.title,
        Category: goal.category,
        Target: goal.target,
        Status: goal.status,
        Priority: goal.priority,
        Progress: goal.progress,
      })),
    );
    addSheet(workbook, "Finance", [
      ...finance.income.map((row) => ({ Section: "Income", ...row })),
      ...finance.fixed.map((row) => ({ Section: "Fixed", ...row })),
      ...finance.variable.map((row) => ({ Section: "Variable", ...row })),
      ...finance.savings.map((row) => ({ Section: "Savings", ...row })),
      {
        Section: "Summary",
        name: "Monthly logged expenses",
        actual: financeSummary.loggedExpenses,
      },
      {
        Section: "Summary",
        name: "Left after monthly plan",
        actual: financeSummary.leftAfterPlan,
      },
    ]);
    addSheet(
      workbook,
      "Expense Ledger",
      finance.expenses.map((expense) => ({
        Date: expense.date,
        Description: expense.note,
        Category: expense.categoryName,
        Amount: expense.amount,
        Currency: expense.currency || "AMD",
        "Amount AMD": expense.amountAMD || expense.amount,
        "USD AMD Rate": expense.fxRate || finance.exchange?.rate || "",
        Source: expense.source,
      })),
    );
    addSheet(
      workbook,
      "Reviews",
      data.reviews.map((review) => ({
        Week: review.week,
        Mood: review.mood,
        Productivity: review.productivity,
        "Tasks Done": review.stats?.tasksDone || 0,
        "Tasks Total": review.stats?.tasksTotal || 0,
        "Habit Days": review.stats?.habitDays || 0,
        "Active Goals": review.stats?.activeGoals || 0,
        "Monthly Net": review.stats?.netFinance || 0,
        Wins: review.wins || "",
        Challenges: review.challenges || "",
        Lessons: review.lessons || "",
        Priorities: review.priorities || "",
        Gratitude: review.gratitude || "",
      })),
    );
    const trendRows = Array.from({ length: 8 }, (_, index) => {
      const weekStart = startOfWeekISO(
        addDays(parseDate(startOfWeekISO()), -7 * (7 - index)),
      );
      const days = new Set(dateRange(weekStart));
      const weekTasks = data.tasks.filter((task) => days.has(task.date));
      return {
        Week: weekStart,
        "Tasks Done": weekTasks.filter((task) => task.status === "Done").length,
        "Habit Days": data.habits.reduce(
          (total, habit) =>
            total +
            Object.entries(habit.log || {}).filter(
              ([date, done]) => days.has(date) && done,
            ).length,
          0,
        ),
      };
    });
    addSheet(workbook, "Chart Data", trendRows);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tracker-export-" + localDate() + ".xlsx";
    link.click();
    URL.revokeObjectURL(url);
    setMessage(
      "Excel workbook exported with all data and chart-ready trend sheets.",
    );
  };
  const importFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!backup || typeof backup !== "object")
          throw new Error("Invalid backup");
        Object.entries(setters).forEach(([key, setter]) => {
          if (backup[key] !== undefined) setter(backup[key]);
        });
        setMessage("Backup restored. Review your data before continuing.");
      } catch {
        setMessage("That file is not a valid tracker backup.");
      }
    };
    reader.readAsText(file);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <Card className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Export & Backup</h2>
        <p>
          Download a full JSON backup or restore one from another browser or
          device.
        </p>
        <Button variant="primary" onClick={exportAll}>
          <Download size={18} /> Download Full Backup
        </Button>
        <Button onClick={exportExcel}>
          <FileSpreadsheet size={18} /> Export Excel Workbook
        </Button>
        <label className="upload-btn">
          <Upload size={18} /> Restore From Backup
          <input
            type="file"
            accept="application/json,.json"
            onChange={importFile}
          />
        </label>
        {message && <div className="notice">{message}</div>}
        <Button onClick={onClose}>Close</Button>
      </Card>
    </div>
  );
}
