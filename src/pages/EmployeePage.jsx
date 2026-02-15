import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Employee.css";

export default function EmployeePage() {
  /* ------------------ SESSION ------------------ */
  const [employeeName, setEmployeeName] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [currentShiftId, setCurrentShiftId] = useState(null);

  /* ------------------ DATA ------------------ */
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");

  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLb, setLoadingLb] = useState(false);

  /* ============================================================
     LOAD SESSION
  ============================================================ */
  useEffect(() => {
    const name = sessionStorage.getItem("employeeName");
    const id = sessionStorage.getItem("employeeId");
    const rest = sessionStorage.getItem("restaurantId");

    if (!name || !id || !rest) {
      window.location.href = "/login";
      return;
    }

    setEmployeeName(name);
    setEmployeeId(Number(id));
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
     ADD / UPDATE CART
  ============================================================ */
  function addItem(item) {
    setCart((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { ...item, qty: 1 }];
    });
  }

  function updateQuantity(item, change) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + change } : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  /* ============================================================
     GET CURRENT SHIFT
  ============================================================ */
  async function getCurrentShift() {
    if (!employeeId) return null;

    const { data, error } = await supabase
      .from("employee_shifts")
      .select("id")
      .eq("employee_id", employeeId)
      .is("clock_out_at", null)
      .maybeSingle();

    if (error) {
      console.error("Error getting current shift:", error);
      return null;
    }

    return data?.id;
  }

  /* ============================================================
     SUBMIT ORDER
  ============================================================ */
  async function submitUpsells(e) {
    e.preventDefault();
    setMessage("");

    if (orderNumber.length < 1 || orderNumber.length > 2 || orderNumber === "0") {
      return setMessage("⚠️ Ordernummer måste vara 1–2 siffror och inte bara 0.");
    }

    const shiftId = await getCurrentShift();
    if (!shiftId) {
      return setMessage("❌ Ingen aktiv skift hittades. Stämpla in igen.");
    }

    // Create order first
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        restaurant_id: restaurantId,
        employee_id: employeeId,
        shift_id: shiftId,
        order_number: orderNumber,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation error:", orderError);
      return setMessage("❌ Fel vid skapande av beställning.");
    }

    // Create order items
    const orderItems = cart.map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.qty,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items creation error:", itemsError);
      return setMessage("❌ Fel vid registrering av artiklar.");
    }

    setCart([]);
    setOrderNumber("");
    setMessage("✔ Registrerat!");
  }

  /* ============================================================
     LEADERBOARD (ACTIVE SHIFTS ONLY)
  ============================================================ */
  async function loadLeaderboard() {
    if (!restaurantId) return;

    setLoadingLb(true);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    // 1) Get all employees with active shifts (no date filter)
    const { data: activeShifts, error: shiftError } = await supabase
      .from("employee_shifts")
      .select(`
        employee_id,
        employees:employee_id ( id, name, restaurant_id )
      `)
      .is("clock_out_at", null);

    console.log("Active shifts query result:", activeShifts);
    console.log("Shift error:", shiftError);

    if (shiftError) {
      console.error("Error loading active shifts:", shiftError);
      setLoadingLb(false);
      return;
    }

    const activeById = {};
    const lbMap = {};

    (activeShifts || []).forEach((shift) => {
      const emp = shift.employees;
      if (!emp || emp.restaurant_id !== restaurantId) return;
      
      activeById[emp.id] = emp;
      lbMap[emp.id] = { employee_id: emp.id, name: emp.name, total: 0 };
    });

    if (!activeShifts || activeShifts.length === 0) {
      setLeaderboard([]);
      setLoadingLb(false);
      return;
    }

    // 2) Get today's orders (simplified query)
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        employee_id,
        order_items (
          quantity,
          menu_items:menu_item_id ( name )
        )
      `)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString());

    console.log("Orders query result:", orders);
    console.log("Orders error:", ordersError);

    if (ordersError) {
      console.error("Error loading orders:", ordersError);
      setLoadingLb(false);
      return;
    }

    // 3) Count order items from active employees only
    const activeEmployeeIds = new Set((activeShifts || []).map(s => s.employee_id));
    console.log("Active employee IDs:", activeEmployeeIds);
    
    (orders || []).forEach((order) => {
      if (!activeEmployeeIds.has(order.employee_id)) {
        console.log("Skipping order from inactive employee:", order.employee_id);
        return;
      }
      
      const entry = lbMap[order.employee_id];
      if (!entry) {
        console.log("No entry found for employee:", order.employee_id);
        return;
      }
      
      (order.order_items || []).forEach((item) => {
        const itemName = item.menu_items?.name;
        if (!itemName) {
          console.log("Skipping item with no name:", item);
          return;
        }

        entry.total += item.quantity;
        entry[itemName] = (entry[itemName] || 0) + item.quantity;
      });
    });
    
    const rows = Object.values(lbMap).sort((a, b) => b.total - a.total);
    console.log("Final leaderboard rows:", rows);
    setLeaderboard(rows);
    setLoadingLb(false);
  }


  /* ============================================================
     SMOOTH REALTIME RELOAD
  ============================================================ */
  let reloadTimeout = null;

  function scheduleReload() {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      loadLeaderboard(); // No loading state for realtime
    }, 300);
  }

  /* ============================================================
     REALTIME UPDATES
  ============================================================ */
  useEffect(() => {
    if (!restaurantId || !employeeId) return;

    loadLeaderboard();
    getCurrentShift().then(setCurrentShiftId);

    const channel = supabase.channel(
      "employee_live_updates_" + restaurantId + "_" + employeeId
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        if (
          payload.new?.restaurant_id === restaurantId ||
          payload.old?.restaurant_id === restaurantId
        ) {
          scheduleReload();
        }
      }
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_items" },
      scheduleReload
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "employee_shifts" },
      async () => {
        const newShiftId = await getCurrentShift();

        if (!newShiftId) {
          sessionStorage.clear();
          window.location.href = "/login";
          return;
        }

        setCurrentShiftId(newShiftId);
        scheduleReload();
      }
    );

    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [restaurantId]);



  /* ============================================================
     CLOCK OUT (close current shift)
  ============================================================ */
  async function clockOut() {
    const shiftId = await getCurrentShift();
    if (!shiftId) {
      sessionStorage.clear();
      window.location.href = "/login";
      return;
    }

    const { error } = await supabase
      .from("employee_shifts")
      .update({ clock_out_at: new Date().toISOString() })
      .eq("id", shiftId);

    if (error) {
      console.error("Clock out error:", error);
    }

    sessionStorage.clear();
    window.location.href = "/login";
  }

  /* ============================================================
     NUMBER PAD
  ============================================================ */
  function pressNum(n) {
    if (orderNumber.length < 2) {
      setOrderNumber((prev) => prev + n);
    }
  }

  function delNum() {
    setOrderNumber((prev) => prev.slice(0, -1));
  }

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="employee-page">
      {/* TOP BAR */}
      <div className="topbar">
        <span className="mclogo">🍔</span>

        <div className="user-box">
          <span>Inloggad:</span>
          <strong>{employeeName}</strong>
          <button className="logout-btn" onClick={clockOut}>
            Stämpla ut
          </button>
        </div>
      </div>

      <div className="content">
        {/* LEFT PANEL */}
        <div className="left-panel">

          {/* MENU GRID */}
          <div className="item-grid">
            {menuItems.map((item) => (
              <div
                key={item.id}
                className="item-card"
                onClick={() => addItem(item)}
              >
                <p className="item-name">{item.name}</p>
              </div>
            ))}
          </div>

          {/* CART */}
          <div className="cart-panel">
            <h4 className="cart-title">Beställning</h4>

            {cart.length === 0 ? (
              <p className="cart-empty">Inga artiklar valda.</p>
            ) : (
              <div className="cart-items no-scroll">
                {cart.map((item) => (
                  <div key={item.id} className="cart-item compact">
                    <span className="cart-name">{item.name}</span>
                    <div className="cart-qty">
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity(item, -1)}
                      >
                        -
                      </button>
                      <span className="qty-value">{item.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity(item, +1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* NUMBER PAD */}
            <div className="numpad-container">
              <div className="numpad-grid-inline">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    className="numpad-key"
                    onClick={() => pressNum(n.toString())}
                  >
                    {n}
                  </button>
                ))}
                <button className="numpad-key del" onClick={delNum}>
                  ⌫
                </button>
                <button
                  className="numpad-key"
                  onClick={() => pressNum("0")}
                >
                  0
                </button>
                <button
                  className="numpad-key del"
                  onClick={() => setOrderNumber("")}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* SUBMIT */}
            <form className="order-form" onSubmit={submitUpsells}>
              <input
                className="order-input"
                placeholder="Ordernummer max 2 siffror"
                value={orderNumber}
                readOnly
              />
              <button
                className="submit-btn"
                disabled={
                  cart.length === 0 ||
                  orderNumber === "" ||
                  orderNumber === "0" ||
                  orderNumber.length > 2
                }

              >
                Registrera upsells
              </button>
              {message && <p className="msg">{message}</p>}
            </form>
          </div>
        </div>

        {/* RIGHT PANEL — LEADERBOARD */}
        <div className="cart-panel">
          <h4 className="cart-title">Leaderboard (idag)</h4>

          {loadingLb ? (
            <p>Laddar...</p>
          ) : leaderboard.length === 0 ? (
            <p className="cart-empty">Ingen är stämplad in.</p>
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
                  <tr key={row.employee_id || row.name}>
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
