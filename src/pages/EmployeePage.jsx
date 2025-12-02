import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Employee.css";

export default function EmployeePage() {
  /* ------------------ SESSION ------------------ */
  const [employeeName, setEmployeeName] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);

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
        .from("menu_items_2")
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
     SUBMIT UPSELLS
  ============================================================ */
  async function submitUpsells(e) {
    e.preventDefault();
    setMessage("");

    if (orderNumber.length < 1 || orderNumber.length > 2 || orderNumber === "0") {
      return setMessage("⚠️ Ordernummer måste vara 1–2 siffror och inte bara 0.");
    }

    const rows = [];
    cart.forEach((item) => {
      for (let i = 0; i < item.qty; i++) {
        rows.push({
          restaurant_id: restaurantId,
          employee_id: employeeId,
          menu_item_id: item.id,
          order_number: orderNumber,
        });
      }
    });

    const { error } = await supabase.from("upsells_2").insert(rows);
    if (error) {
      console.error(error);
      return setMessage("❌ Fel vid registrering.");
    }

    setCart([]);
    setOrderNumber("");
    setMessage("✔ Registrerat!");
  }

  /* ============================================================
     LEADERBOARD (ONLY CLOCKED-IN EMPLOYEES)
  ============================================================ */
  async function loadLeaderboard() {
    if (!restaurantId) return;

    setLoadingLb(true);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    // 1) Get all currently clocked-in employees
    const { data: employees, error: empError } = await supabase
      .from("employees_2")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("clocked_in", true);

    if (empError) {
      console.error("Error loading employees:", empError);
      setLoadingLb(false);
      return;
    }

    const activeById = {};
    const lbMap = {};

    (employees || []).forEach((emp) => {
      activeById[emp.id] = emp;
      lbMap[emp.id] = { name: emp.name, total: 0 };
    });

    if (!employees || employees.length === 0) {
      setLeaderboard([]);
      setLoadingLb(false);
      return;
    }

    // 2) Get today's upsells
    const { data: ups, error: upsError } = await supabase
      .from("upsells_2")
      .select(`
        id,
        employee_id,
        menu_item_id,
        created_at,
        menu_items_2:menu_item_id ( name )
      `)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString());

    if (upsError) {
      console.error("Error loading upsells:", upsError);
      setLoadingLb(false);
      return;
    }

    // 3) Count upsells
    (ups || []).forEach((u) => {
      if (!activeById[u.employee_id]) return;

      const itemName = u.menu_items_2?.name;
      if (!itemName) return;

      const entry = lbMap[u.employee_id];
      entry.total += 1;
      entry[itemName] = (entry[itemName] || 0) + 1;
    });

    const rows = Object.values(lbMap).sort((a, b) => b.total - a.total);
    setLeaderboard(rows);
    setLoadingLb(false);
  }


  /* ============================================================
     REALTIME UPDATES
     - Fixar att nya anställda dyker upp direkt (INSERT)
     - Fixar live leaderboard när upsells ändras
     - Fixar auto-logout när manager clockar ut anställd
     - Inga refresh behövs längre
  ============================================================ */
  useEffect(() => {
    if (!restaurantId || !employeeId) return;

    // Initial load
    loadLeaderboard();

    const channel = supabase.channel("employee_live_updates_" + restaurantId);

    /* ------------------------------------------------------------
       1) UPSALES CHANGES (INSERT, UPDATE, DELETE)
       Live leaderboard whenever upsells change
    ------------------------------------------------------------ */
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "upsells_2" },
      (payload) => {
        // Only reload if upsell belongs to this restaurant
        if (
          payload.new?.restaurant_id === restaurantId ||
          payload.old?.restaurant_id === restaurantId
        ) {
          loadLeaderboard();
        }
      }
    );

    /* ------------------------------------------------------------
       2) EMPLOYEE INSERT (NEW PERSON CLOCKS IN FIRST TIME)
       🔥 Fixar ditt problem — nu syns nya direkt utan refresh!
    ------------------------------------------------------------ */
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "employees_2" },
      (payload) => {
        const newEmp = payload.new;

        // Only if new employee belongs to same restaurant
        if (newEmp.restaurant_id === restaurantId && newEmp.clocked_in === true) {
          loadLeaderboard();
        }
      }
    );

    /* ------------------------------------------------------------
       3) EMPLOYEE UPDATE (CLOCK OUT, NAME CHANGE, etc)
       - Uppdaterar leaderboard live
       - Auto-logout om du själv blir utloggad av manager
    ------------------------------------------------------------ */
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "employees_2" },
      (payload) => {
        const updated = payload.new;

        // Auto logout if you were clocked out by a manager
        if (updated.id === employeeId && updated.clocked_in === false) {
          sessionStorage.clear();
          window.location.href = "/login";
          return;
        }

        // If another employee at same restaurant changed → reload
        if (updated.restaurant_id === restaurantId) {
          loadLeaderboard();
        }
      }
    );

    /* ------------------------------------------------------------
       4) EMPLOYEE DELETE (if you ever add delete feature)
       Ensures leaderboard updates instantly
    ------------------------------------------------------------ */
    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "employees_2" },
      (payload) => {
        const oldEmp = payload.old;

        if (oldEmp.restaurant_id === restaurantId) {
          loadLeaderboard();
        }
      }
    );

    // Subscribe & cleanup
    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [restaurantId, employeeId]);



  /* ============================================================
     CLOCK OUT (manual user logout)
  ============================================================ */
  async function clockOut() {
    await supabase
      .from("employees_2")
      .update({ clocked_in: false })
      .eq("id", employeeId);

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
