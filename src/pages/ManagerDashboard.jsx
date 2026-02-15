import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Manager.css";
import "../styles/AppLayout.css";

export default function ManagerDashboard() {

  /* ============================================================
     STATE
  ============================================================ */
  const [managerUsername, setManagerUsername] = useState(null);

  const [orders, setOrders] = useState([]);

  const [todayStats, setTodayStats] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);

  const [activeShifts, setActiveShifts] = useState([]);

  const [restaurants, setRestaurants] = useState([]);

  const [selectedRestaurant, setSelectedRestaurant] = useState("ALL");

  const [isLoading, setIsLoading] = useState(false);

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
     INITIAL LOAD
  ============================================================ */
  useEffect(() => {
    loadRestaurants();
    loadData();
    loadActiveShifts();
  }, []);

  /* ============================================================
     REALTIME SUBSCRIPTION
  ============================================================ */
  useEffect(() => {
    const channel = supabase
      .channel("manager_updates")

      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadData();
        }
      )

      .on("postgres_changes",
        { event: "*", schema: "public", table: "employee_shifts" },
        () => {
          loadActiveShifts();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // IMPORTANT: empty dependency

  // Reload data when filter changes
  useEffect(() => {
    loadData();
  }, [selectedRestaurant]);

  /* ============================================================
     LOAD ALL RESTAURANTS
  ============================================================ */
  async function loadRestaurants() {
    const { data } = await supabase
      .from("restaurants")
      .select("id, name");

    setRestaurants(data || []);
  }


  /* ============================================================
     LOAD ACTIVE SHIFTS
  ============================================================ */
  async function loadActiveShifts() {
    let query = supabase
      .from("employee_shifts")
      .select(`
        id,
        employee_id,
        restaurant_id,
        clock_in_at,
        employees (
          id,
          name
        ),
        restaurants (
          name
        )
      `)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false });

    if (selectedRestaurant !== "ALL") {
      query = query.eq("restaurant_id", Number(selectedRestaurant));
    }

    const { data: shifts } = await query;

    const formatted = (shifts || []).map((shift) => ({
      shift_id: shift.id,
      employee_id: shift.employee_id,
      name: shift.employees?.name,
      restaurant_name: shift.restaurants?.name,
      clocked_at: shift.clock_in_at,
    }));

    setActiveShifts(formatted);
  }


  /* ============================================================
     LOAD ALL ORDERS + DAILY STATS + LEADERBOARD
  ============================================================ */
  async function loadData() {
    if (isLoading) {
      console.log("Blocked overlapping loadData call");
      return;
    }

    setIsLoading(true);

    // CLEAR UI STATE FIRST
    setOrders([]);
    setLeaderboard([]);
    setTodayStats({});
    // ---------- Load all orders with items ----------
    let query = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        created_at,
        employee_id,
        restaurant_id,
        employees:employee_id ( name ),
        restaurants:restaurant_id ( name ),
        order_items (
          quantity,
          menu_items:menu_item_id ( name )
        )
      `)
      .order("created_at", { ascending: false });

    if (selectedRestaurant !== "ALL") {
      query = query.eq("restaurant_id", Number(selectedRestaurant));
    }

    const { data: ordersData } = await query;

    // Flatten orders for display
    const flattened = [];
    (ordersData || []).forEach((order) => {
      (order.order_items || []).forEach((item) => {
        for (let i = 0; i < item.quantity; i++) {
          flattened.push({
            id: order.id,
            order_number: order.order_number,
            created_at: order.created_at,
            employee_name: order.employees?.name,
            restaurant_id: order.restaurant_id,
            restaurant_name: order.restaurants?.name,
            item_name: item.menu_items?.name,
          });
        }
      });
    });

    setOrders(flattened);
    console.log('Selected restaurant:', selectedRestaurant);
    console.log('Flattened orders:', flattened);
    console.log('Available restaurants:', restaurants);

    /* ---------- Today's stats ---------- */
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const todays = flattened.filter((u) => {
      const created = new Date(u.created_at);
      return created >= start && created <= new Date();
    });

    const itemCounts = {};
    const lbMap = {};

    todays.forEach((u) => {
      const empName = u.employee_name;
      const itemName = u.item_name;

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

    setIsLoading(false);
  }


  /* ============================================================
     FORCE CLOCK OUT EMPLOYEE
  ============================================================ */
  async function forceClockOut(shiftId) {
    const { error } = await supabase
      .from("employee_shifts")
      .update({ clock_out_at: new Date().toISOString() })
      .eq("id", shiftId);

    if (error) console.error(error);

    loadActiveShifts();
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
    const rows = orders
      .filter((u) => new Date(u.created_at) >= new Date().setHours(0, 0, 0, 0))
      .filter((u) =>
        selectedRestaurant === "ALL"
          ? true
          : u.restaurant_id === Number(selectedRestaurant)
      )
      .map((u) => ({
        restaurant: u.restaurant_name,
        time: new Date(u.created_at).toLocaleString("sv-SE"),
        employee: u.employee_name,
        item: u.item_name,
        order_number: u.order_number,
      }));

    exportCSV("leaderboard_today.csv", rows);
  }


  function exportOrdersCSV() {
    const rows = orders
      .filter((u) =>
        selectedRestaurant === "ALL"
          ? true
          : u.restaurant_id === Number(selectedRestaurant)
      )
      .map((u) => ({
        restaurant: u.restaurant_name,
        time: new Date(u.created_at).toLocaleString("sv-SE"),
        employee: u.employee_name,
        item: u.item_name,
        order_number: u.order_number,
      }));

    exportCSV("all_orders.csv", rows);
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
                  value={selectedRestaurant}
                  onChange={(e) => setSelectedRestaurant(e.target.value)}
                >
                  <option value="ALL">Visa alla</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
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
                  {leaderboard.map((row) => (
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
                  value={selectedRestaurant}
                  onChange={(e) => setSelectedRestaurant(e.target.value)}
                >
                  <option value="ALL">Visa alla</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <button className="export-btn" onClick={exportOrdersCSV}>
                  Exportera CSV
                </button>
              </div>
            </div>

            {orders.length === 0 ? (
              <p>Inga beställningar registrerade än.</p>
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
                  {orders.map((u) => (
                    <tr key={`${u.id}-${u.item_name}-${u.created_at}`}>
                      <td>{u.restaurant_name}</td>
                      <td>{new Date(u.created_at).toLocaleString("sv-SE")}</td>
                      <td>{u.employee_name}</td>
                      <td>{u.item_name}</td>
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
          <h2 className="section-title">Just nu aktiva skift</h2>

          {activeShifts.length === 0 ? (
            <p>Inga aktiva skift.</p>
          ) : (
            <ul className="clocked-list">
              {activeShifts.map((c) => (
                <li key={c.name} className="clocked-item">
                  <div className="clocked-info">
                    <strong>{c.name}</strong>
                    <span className="clocked-time">
                      sedan {new Date(c.clocked_at).toLocaleTimeString("sv-SE")}
                    </span>
                  </div>

                  <button
                    className="clockout-btn"
                    onClick={() => forceClockOut(c.shift_id)}
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
