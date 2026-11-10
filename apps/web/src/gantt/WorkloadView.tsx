import { useMemo, type ReactElement } from "react";
import { fromDayNumber, type GanttData } from "@linework/shared";
import { computeWorkload } from "./workload";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function weekLabel(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ""}`;
}

/** Owners by weeks, showing assigned working days and flagging anyone booked beyond capacity. */
export function WorkloadView({ gantt }: { gantt: GanttData }): ReactElement {
  const workload = useMemo(() => computeWorkload(gantt), [gantt]);
  if (workload.rows.length === 0) {
    return (
      <div className="workload workload--empty">
        <p>Add tasks with owners to see who is busy when.</p>
      </div>
    );
  }
  const overbooked = workload.rows.filter((r) =>
    r.days.some((d, i) => d > (workload.weeks[i]?.capacity ?? 5)),
  );
  return (
    <div className="workload">
      <p className="workload__summary" role="status">
        {overbooked.length === 0
          ? "Nobody is booked beyond a full week."
          : `Overbooked: ${overbooked.map((r) => r.owner).join(", ")}. Red cells have more task-days than working days.`}
      </p>
      <div className="workload__scroll">
        <table className="workload__table">
          <thead>
            <tr>
              <th scope="col">Owner</th>
              {workload.weeks.map((w) => (
                <th
                  key={w.start}
                  scope="col"
                  title={`Week of ${fromDayNumber(w.start)}, ${String(w.capacity)} working days`}
                >
                  {weekLabel(w.start)}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {workload.rows.map((row) => (
              <tr key={row.owner}>
                <th scope="row">{row.owner}</th>
                {row.days.map((days, i) => {
                  const capacity = workload.weeks[i]?.capacity ?? 5;
                  const level =
                    days === 0 ? "none" : days > capacity ? "over" : days === capacity ? "full" : "some";
                  return (
                    <td
                      key={i}
                      className={`workload__cell workload__cell--${level}`}
                      title={`${String(days)} of ${String(capacity)} days`}
                    >
                      {days > 0 ? days : ""}
                    </td>
                  );
                })}
                <td className="workload__total">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
