import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Employee.css";

export default function LeaderboardPage() {
  const [restaurantId, setRestaurantId] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ============================================================
     LOAD SESSION
  ============================================================ */
  useEffect(() => {
    const rest = sessionStorage.getItem("restaurantId");

    if (!rest) {
      window.location.href = "/login";
      return;
    }

    setRestaurantId(Number(rest));
  }, []);

  /* ============================================================
     LOAD MENU FOR RESTAURANT
  ============================================================ */
  useEffect(() => {
    if (!restaurantId) return;

    (async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);

      setMenuItems(data || []);
    })();
  }, [restaurantId]);

  /* ============================================================
     LOAD LEADERBOARD
  ============================================================ */
  async function loadLeaderboard() {
    if (!restaurantId) return;

    setLoading(true);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    // Get today's orders with order items and filter by active shifts
    const { data: orders } = await supabase
      .from("orders")
      .select(`
        employee_id,
        order_items (
          quantity,
          menu_items:menu_item_id ( name )
        ),
        employees:employee_id ( name ),
        employee_shifts:shift_id ( employee_id )
      `)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString());

    const lb = {};

    // Get active shifts for filtering
    const { data: activeShifts } = await supabase
      .from("employee_shifts")
      .select("employee_id")
      .is("clock_out_at", null);

    const activeEmployeeIds = new Set((activeShifts || []).map(s => s.employee_id));

    (orders || []).forEach((order) => {
      const emp = order.employees?.name;
      if (!emp || !activeEmployeeIds.has(order.employee_id)) return;

      if (!lb[emp]) lb[emp] = { name: emp, total: 0 };

      (order.order_items || []).forEach((item) => {
        const itemName = item.menu_items?.name;
        if (!itemName) return;

        lb[emp].total += item.quantity;
        lb[emp][itemName] = (lb[emp][itemName] || 0) + item.quantity;
      });
    });

    setLeaderboard(Object.values(lb).sort((a, b) => b.total - a.total));
    setLoading(false);
  }

  /* ============================================================
     REALTIME UPDATES
  ============================================================ */
  useEffect(() => {
    if (!restaurantId) return;

    loadLeaderboard();

    const channel = supabase
      .channel("leaderboard_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        loadLeaderboard
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        loadLeaderboard
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [restaurantId]);

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="employee-page">
      {/* TOPBAR */}
      <div className="topbar">
        <span className="mclogo">🥇</span>
        <div className="user-box">
          <span>Leaderboard</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="content" style={{ maxWidth: "900px" }}>
        <div className="cart-panel" style={{ width: "100%" }}>
          <h4 className="cart-title">Leaderboard (idag)</h4>

          {loading ? (
            <p>Laddar...</p>
          ) : leaderboard.length === 0 ? (
            <p className="cart-empty">Inga upsells ännu.</p>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Medarbetare</th>
                  <th>Totalt</th>
                  {menuItems.map((item) => (
                    <th key={item.id}>{item.name}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.total}</td>

                    {menuItems.map((item) => (
                      <td key={item.id}>{row[item.name] || 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
