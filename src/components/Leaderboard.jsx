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
        .from("menu_items_2")
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

    const { data: ups } = await supabase
      .from("upsells_2")
      .select(`
        id,
        employee_id,
        menu_item_id,
        created_at,
        employees_2:employee_id ( name ),
        menu_items_2:menu_item_id ( name )
      `)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString());

    const lb = {};

    (ups || []).forEach((u) => {
      const emp = u.employees_2?.name;
      const item = u.menu_items_2?.name;
      if (!emp || !item) return;

      if (!lb[emp]) lb[emp] = { name: emp, total: 0 };
      lb[emp].total++;
      lb[emp][item] = (lb[emp][item] || 0) + 1;
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
        { event: "*", schema: "public", table: "upsells_2" },
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
