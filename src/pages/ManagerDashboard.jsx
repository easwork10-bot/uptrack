/**
 * ManagerDashboard.jsx
 * ------------------------------------------------------------
 * Displays:
 * - Today's upsell statistics
 * - Today's leaderboard
 * - All upsells (latest first)
 * - Currently clocked-in employees
 *
 * Notes:
 * - This version is fully cleaned (Option A)
 * - No item-add forms / no unused JSX or CSS
 * - Realtime updates enabled for both tables
 */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Manager.css";
import "../styles/AppLayout.css";

const ITEM_LIST = ["Äpple paj", "Plusmeny", "Dipsås", "Kaffe"];

export default function ManagerDashboard() {
  const [upsells, setUpsells] = useState([]);
  const [todayStats, setTodayStats] = useState({
    total: 0,
    byItem: {
      "Äpple paj": 0,
      Plusmeny: 0,
      Dipsås: 0,
      Kaffe: 0,
    },
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [clockedInEmployees, setClockedInEmployees] = useState([]);

  /* ============================================================
     LOAD ALL MANAGER DATA (stats, leaderboard, upsells, online)
  ============================================================ */
  async function loadManagerData() {
    // Load all upsells
    const { data: upsellRows, error } = await supabase
      .from("upsells")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Upsell fetch error:", error);
      return;
    }
    setUpsells(upsellRows || []);

    /* ---- Today filter ---- */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todays = (upsellRows || []).filter(
      (u) => new Date(u.created_at) >= todayStart
    );

    /* ---- Count by item ---- */
    const itemCounts = {
      "Äpple paj": 0,
      Plusmeny: 0,
      Dipsås: 0,
      Kaffe: 0,
    };

    todays.forEach((u) => {
      if (itemCounts[u.item] !== undefined) {
        itemCounts[u.item] += 1;
      }
    });

    setTodayStats({
      total: todays.length,
      byItem: itemCounts,
    });

    /* ---- Leaderboard (today only) ---- */
    const lb = {};
    todays.forEach((u) => {
      if (!lb[u.employee_name]) {
        lb[u.employee_name] = {
          name: u.employee_name,
          total: 0,
          "Äpple paj": 0,
          Plusmeny: 0,
          Dipsås: 0,
          Kaffe: 0,
        };
      }
      lb[u.employee_name].total++;
      if (lb[u.employee_name][u.item] !== undefined) {
        lb[u.employee_name][u.item]++;
      }
    });

    setLeaderboard(
      Object.values(lb).sort((a, b) => b.total - a.total)
    );

    /* ---- Clocked-in employees ---- */
    const { data: clocked, error: clkErr } = await supabase
      .from("employees_clocked")
      .select("name, clocked_in, clocked_at");

    if (clkErr) {
      console.error("Clocked-in fetch error:", clkErr);
      return;
    }

    setClockedInEmployees((clocked || []).filter((e) => e.clocked_in));
  }

  /* ============================================================
     INITIAL LOAD + REALTIME UPDATES
  ============================================================ */
  useEffect(() => {
    loadManagerData();

    const channel = supabase
      .channel("manager_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "upsells" },
        loadManagerData
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees_clocked" },
        loadManagerData
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  /* ============================================================
     NAVIGATION
  ============================================================ */
  function goHome() {
    window.location.href = "/";
  }

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="manager-page">
      {/* TOP BAR */}
      <div className="topbar">
        <span className="logo">🍔 Manager</span>

        <div className="user-box">
          <span>Managervy</span>
          <button className="logout-btn" onClick={goHome}>
            Till startsidan
          </button>
        </div>
      </div>

      <div className="manager-container">
        {/* ---------------- LEFT PANEL ---------------- */}
        <div className="left-panel">

          {/* TODAY STATS */}
          <div className="section shadow">
            <h2 className="section-title">Dagens läge</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <p className="stat-label">Totalt antal upsells</p>
                <p className="stat-value">{todayStats.total}</p>
              </div>

              {ITEM_LIST.map((item) => (
                <div key={item} className="stat-card">
                  <p className="stat-label">{item}</p>
                  <p className="stat-value">{todayStats.byItem[item]}</p>
                </div>
              ))}
            </div>
          </div>

          {/* LEADERBOARD */}
          <div className="section shadow">
            <h2 className="section-title">Leaderboard (idag)</h2>

            {leaderboard.length === 0 ? (
              <p>Inga upsells idag.</p>
            ) : (
              <table className="upsell-table">
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
                      <td>{row["Äpple paj"]}</td>
                      <td>{row["Plusmeny"]}</td>
                      <td>{row["Dipsås"]}</td>
                      <td>{row["Kaffe"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ALL UPSELLS */}
          <div className="section shadow">
            <h2 className="section-title">Alla upsells (senaste först)</h2>

            {upsells.length === 0 ? (
              <p>Inga upsells registrerade.</p>
            ) : (
              <table className="upsell-table">
                <thead>
                  <tr>
                    <th>Tid</th>
                    <th>Medarbetare</th>
                    <th>Artikel</th>
                    <th>Ordernr</th>
                  </tr>
                </thead>

                <tbody>
                  {upsells.map((u) => (
                    <tr key={u.id}>
                      <td>
                        {new Date(u.created_at).toLocaleTimeString("sv-SE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{u.employee_name}</td>
                      <td>{u.item}</td>
                      <td>{u.order_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ---------------- RIGHT PANEL ---------------- */}
        <div className="right-panel section shadow">
          <h2 className="section-title">Just nu inloggade</h2>

          {clockedInEmployees.length === 0 ? (
            <p>Ingen är stämplad in.</p>
          ) : (
            <ul>
              {clockedInEmployees.map((emp) => (
                <li key={emp.name}>
                  {emp.name}{" "}
                  <span style={{ fontSize: "0.8rem", color: "#777" }}>
                    (sedan{" "}
                    {new Date(emp.clocked_at).toLocaleTimeString("sv-SE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    )
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
