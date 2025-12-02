import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Manager.css";
import "../styles/AppLayout.css";

export default function ManagerDashboard() {

  /* ============================================================
     STATE
  ============================================================ */
  const [managerUsername, setManagerUsername] = useState(null);

  const [upsells, setUpsells] = useState([]);
  const [filteredUpsells, setFilteredUpsells] = useState([]);

  const [todayStats, setTodayStats] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardFiltered, setLeaderboardFiltered] = useState([]);

  const [clockedIn, setClockedIn] = useState([]);

  const [restaurants, setRestaurants] = useState([]);

  const [filterLeaderboardRestaurant, setFilterLeaderboardRestaurant] = useState("ALL");
  const [filterUpsellsRestaurant, setFilterUpsellsRestaurant] = useState("ALL");


  /* ============================================================
     LOAD MANAGER SESSION
  ============================================================ */
  useEffect(() => {
    const isAdmin = sessionStorage.getItem("manager_is_admin");
    const username = sessionStorage.getItem("manager_username");

    if (!isAdmin) {
      window.location.href = "/login";
      return;
    }

    setManagerUsername(username);
  }, []);


  /* ============================================================
     INITIAL LOAD + REALTIME OPTIMIZED
  ============================================================ */
  useEffect(() => {
    loadRestaurants();
    loadData();

    const channel = supabase
      .channel("manager_updates")

      // UPSSELL changes → reload full data (affects stats + leaderboard)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "upsells_2" },
        () => loadData()
      )

      // EMPLOYEE changes → reload clocked-in only
      .on("postgres_changes",
        { event: "*", schema: "public", table: "employees_2" },
        () => loadClockedIn()
      )

      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);


  /* ============================================================
     LOAD ALL RESTAURANTS
  ============================================================ */
  async function loadRestaurants() {
    const { data } = await supabase.from("restaurants_2").select("name");
    setRestaurants(data?.map((r) => r.name) || []);
  }


  /* ============================================================
     LOAD CLOCKED-IN EMPLOYEES
  ============================================================ */
  async function loadClockedIn() {
    const { data: emp } = await supabase
      .from("employees_2")
      .select("name, restaurant_id, clocked_in, clocked_at")
      .eq("clocked_in", true);

    setClockedIn(emp || []);
  }


  /* ============================================================
     LOAD ALL UPSALES + DAILY STATS + LEADERBOARD
  ============================================================ */
  async function loadData() {

    /* ---------- Load all upsells ---------- */
    const { data: ups } = await supabase
      .from("upsells_2")
      .select(`
        id,
        order_number,
        created_at,
        employee_id,
        menu_item_id,
        employees_2:employee_id ( name, restaurant_id ),
        menu_items_2:menu_item_id ( name ),
        restaurants_2:restaurant_id ( name )
      `)
      .order("created_at", { ascending: false });

    setUpsells(ups || []);
    applyUpsellsFilter(ups || []);

    /* ---------- Clocked-in employees ---------- */
    loadClockedIn();

    /* ---------- Today's stats ---------- */
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const todays = (ups || []).filter(
      (u) => new Date(u.created_at) >= start
    );

    const itemCounts = {};
    const lbMap = {};

    todays.forEach((u) => {
      const empName = u.employees_2?.name;
      const itemName = u.menu_items_2?.name;

      itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;

      if (!lbMap[empName]) lbMap[empName] = { name: empName, total: 0 };
      lbMap[empName].total++;
      lbMap[empName][itemName] = (lbMap[empName][itemName] || 0) + 1;
    });

    setTodayStats({
      total: todays.length,
      items: itemCounts,
    });

    const lb = Object.values(lbMap).sort((a, b) => b.total - a.total);
    setLeaderboard(lb);
    applyLeaderboardFilter(lb);
  }


  /* ============================================================
     FORCE CLOCK OUT EMPLOYEE
  ============================================================ */
  async function forceClockOut(name) {
    const { error } = await supabase
      .from("employees_2")
      .update({ clocked_in: false })
      .eq("name", name);

    if (error) console.error(error);

    loadClockedIn();
  }


  /* ============================================================
     FILTERING LOGIC
  ============================================================ */
  function applyUpsellsFilter(list) {
    if (filterUpsellsRestaurant === "ALL") {
      return setFilteredUpsells(list);
    }

    setFilteredUpsells(
      list.filter((u) => u.restaurants_2?.name === filterUpsellsRestaurant)
    );
  }

  function applyLeaderboardFilter(list) {
    if (filterLeaderboardRestaurant === "ALL") {
      return setLeaderboardFiltered(list);
    }

    setLeaderboardFiltered(
      list.filter((row) =>
        upsells.some((u) =>
          u.employees_2?.name === row.name &&
          u.restaurants_2?.name === filterLeaderboardRestaurant
        )
      )
    );
  }


  /* ============================================================
     CSV EXPORT
  ============================================================ */
  function exportCSV(filename, rows) {
    if (!rows.length) return;

    const headers = Object.keys(rows[0]);
    const csvContent =
      headers.join(",") +
      "\n" +
      rows
        .map((row) => headers.map((h) => `"${row[h] ?? ""}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }


  function exportLeaderboardCSV() {
    const rows = upsells
      .filter((u) => new Date(u.created_at) >= new Date().setHours(0, 0, 0, 0))
      .filter((u) =>
        filterLeaderboardRestaurant === "ALL"
          ? true
          : u.restaurants_2?.name === filterLeaderboardRestaurant
      )
      .map((u) => ({
        restaurant: u.restaurants_2?.name,
        time: new Date(u.created_at).toLocaleString("sv-SE"),
        employee: u.employees_2?.name,
        item: u.menu_items_2?.name,
        order_number: u.order_number,
      }));

    exportCSV("leaderboard_today.csv", rows);
  }


  function exportUpsellsCSV() {
    const rows = filteredUpsells.map((u) => ({
      restaurant: u.restaurants_2?.name,
      time: new Date(u.created_at).toLocaleString("sv-SE"),
      employee: u.employees_2?.name,
      item: u.menu_items_2?.name,
      order_number: u.order_number,
    }));

    exportCSV("all_upsells.csv", rows);
  }


  /* ============================================================
     LOGOUT
  ============================================================ */
  function logoutManager() {
    sessionStorage.clear();
    window.location.href = "/login";
  }


  /* ============================================================
     RENDER UI
  ============================================================ */
  return (
    <div className="manager-page">

      {/* ===================== TOP BAR ===================== */}
      <div className="topbar">
        <span className="logo">🍔 McUpsell Manager</span>

        <div className="user-box">
          <span>Inloggad:</span>
          <strong>{managerUsername}</strong>
          <button className="logout-btn" onClick={logoutManager}>
            Logga ut
          </button>
        </div>
      </div>


      <div className="manager-container">

        {/* ===================== LEFT PANEL ===================== */}
        <div className="left-panel">

          {/* TODAY SUMMARY */}
          <div className="section shadow">
            <h2 className="section-title">Dagens sammandrag</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <p className="stat-label">Totalt antal upsells</p>
                <p className="stat-value">{todayStats.total || 0}</p>
              </div>

              {todayStats.items &&
                Object.entries(todayStats.items).map(([item, count]) => (
                  <div className="stat-card" key={item}>
                    <p className="stat-label">{item}</p>
                    <p className="stat-value">{count}</p>
                  </div>
                ))}
            </div>
          </div>


          {/* LEADERBOARD */}
          <div className="section shadow">
            <div className="section-header">
              <h2 className="section-title">Leaderboard (idag)</h2>

              <div>
                <select
                  className="filter-select"
                  value={filterLeaderboardRestaurant}
                  onChange={(e) => {
                    setFilterLeaderboardRestaurant(e.target.value);
                    applyLeaderboardFilter(leaderboard);
                  }}
                >
                  <option value="ALL">Visa alla</option>
                  {restaurants.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <button className="export-btn" onClick={exportLeaderboardCSV}>
                  Exportera CSV
                </button>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <p>Inga upsells idag.</p>
            ) : (
              <table className="upsell-table">
                <thead>
                  <tr>
                    <th>Medarbetare</th>
                    <th>Totalt</th>
                    {Object.keys(todayStats.items || {}).map((item) => (
                      <th key={item}>{item}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {leaderboardFiltered.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.total}</td>
                      {Object.keys(todayStats.items || {}).map((item) => (
                        <td key={item}>{row[item] || 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>


          {/* ALL UPSELLS */}
          <div className="section shadow">

            <div className="section-header">
              <h2 className="section-title">Alla upsells</h2>

              <div>
                <select
                  className="filter-select"
                  value={filterUpsellsRestaurant}
                  onChange={(e) => {
                    setFilterUpsellsRestaurant(e.target.value);
                    applyUpsellsFilter(upsells);
                  }}
                >
                  <option value="ALL">Visa alla</option>
                  {restaurants.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <button className="export-btn" onClick={exportUpsellsCSV}>
                  Exportera CSV
                </button>
              </div>
            </div>

            {filteredUpsells.length === 0 ? (
              <p>Inga upsells registrerade än.</p>
            ) : (
              <table className="upsell-table">
                <thead>
                  <tr>
                    <th>Restaurang</th>
                    <th>Tid</th>
                    <th>Medarbetare</th>
                    <th>Artikel</th>
                    <th>Ordernr</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUpsells.map((u) => (
                    <tr key={u.id}>
                      <td>{u.restaurants_2?.name}</td>
                      <td>{new Date(u.created_at).toLocaleString("sv-SE")}</td>
                      <td>{u.employees_2?.name}</td>
                      <td>{u.menu_items_2?.name}</td>
                      <td>{u.order_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>


        {/* ===================== RIGHT PANEL ===================== */}
        <div className="right-panel section shadow">
          <h2 className="section-title">Just nu inloggade</h2>

          {clockedIn.length === 0 ? (
            <p>Ingen är stämplad in.</p>
          ) : (
            <ul className="clocked-list">
              {clockedIn.map((c) => (
                <li key={c.name} className="clocked-item">
                  <div className="clocked-info">
                    <strong>{c.name}</strong>
                    <span className="clocked-time">
                      sedan {new Date(c.clocked_at).toLocaleTimeString("sv-SE")}
                    </span>
                  </div>

                  <button
                    className="clockout-btn"
                    onClick={() => forceClockOut(c.name)}
                  >
                    Logga ut
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
