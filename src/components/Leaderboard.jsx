import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLb, setLoadingLb] = useState(false);

  async function loadLeaderboard() {
    setLoadingLb(true);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { data: active } = await supabase
      .from("employees_clocked")
      .select("name, clocked_in");

    const activeNames = (active || [])
      .filter(e => e.clocked_in)
      .map(e => e.name);

    const base = {};
    activeNames.forEach(name => {
      base[name] = {
        name,
        total: 0,
        APPLE_PIE: 0,
        PLUS_MENU: 0,
        DIPSAUCE: 0,
        COFFEE: 0,
      };
    });

    const { data: ups } = await supabase
      .from("upsells")
      .select("employee_name, item, created_at")
      .gte("created_at", start.toISOString());

    (ups || []).forEach(u => {
      if (!base[u.employee_name]) return;
      base[u.employee_name].total += 1;

      if (u.item === "Äpple paj") base[u.employee_name].APPLE_PIE++;
      if (u.item === "Plusmeny") base[u.employee_name].PLUS_MENU++;
      if (u.item === "Dipsås") base[u.employee_name].DIPSAUCE++;
      if (u.item === "Kaffe") base[u.employee_name].COFFEE++;
    });

    setLeaderboard(Object.values(base).sort((a, b) => b.total - a.total));
    setLoadingLb(false);
  }

  useEffect(() => {
    loadLeaderboard();

    const channel = supabase
      .channel("leaderboard_only")
      .on("postgres_changes", { event: "*", schema: "public", table: "upsells" }, loadLeaderboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees_clocked" }, loadLeaderboard)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="cart-panel">
      <h4 className="cart-title">Leaderboard (idag)</h4>

      {loadingLb ? (
        <p>Laddar...</p>
      ) : leaderboard.length === 0 ? (
        <p className="cart-empty">Inga uppsälj idag ännu.</p>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Medarbetare</th>
              <th>Totalt</th>
              <th>Äpple</th>
              <th>Plusmeny</th>
              <th>Dipsås</th>
              <th>Kaffe</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.total}</td>
                <td>{row.APPLE_PIE}</td>
                <td>{row.PLUS_MENU}</td>
                <td>{row.DIPSAUCE}</td>
                <td>{row.COFFEE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
