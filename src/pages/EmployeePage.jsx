/**
 * EmployeePage.jsx
 * ----------------------------------------
 * Handles:
 * - Employee session (clocked in name)
 * - Item selection grid
 * - Cart quantity management
 * - Upsell submission to Supabase
 * - Live leaderboard (today only)
 * - Live clocked-in coworkers
 */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "../styles/Employee.css";

// -------------------------------------------------------
// CONSTANTS
// -------------------------------------------------------
const ITEMS = [
  { id: "APPLE_PIE", name: "Äpple paj", icon: "🥧" },
  { id: "PLUS_MENU", name: "Plusmeny", icon: "🍔" },
  { id: "DIPSAUCE", name: "Dipsås", icon: "🧂" },
  { id: "COFFEE", name: "Kaffe", icon: "☕️" },
];

export default function EmployeePage() {
  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------
  const [employeeName, setEmployeeName] = useState(null);

  const [cart, setCart] = useState([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");

  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const [clockedInEmployees, setClockedInEmployees] = useState([]);

  // -------------------------------------------------------
  // LOAD EMPLOYEE NAME FROM LOCALSTORAGE
  // -------------------------------------------------------
  useEffect(() => {
    const stored = localStorage.getItem("employeeName");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setEmployeeName(stored);
  }, []);

  // -------------------------------------------------------
  // CART FUNCTIONS
  // -------------------------------------------------------

  /** Add an item or increase quantity */
  function addItemToCart(item) {
    setCart((prevCart) => {
      const existing = prevCart.find((i) => i.id === item.id);
      if (existing) {
        return prevCart.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prevCart, { ...item, qty: 1 }];
    });
  }

  /** Increase or decrease quantity */
  function updateCartItemQuantity(item, changeAmount) {
    setCart((prevCart) =>
      prevCart
        .map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + changeAmount } : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  /** Total item count */
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);

  // -------------------------------------------------------
  // SUBMIT UPSELLS
  // -------------------------------------------------------
  async function submitUpsells(e) {
    e.preventDefault();
    setMessage("");

    if (!employeeName) {
      setMessage("⚠️ Du är inte inloggad. Stämpla in igen.");
      return;
    }

    if (!orderNumber.trim()) {
      setMessage("⚠️ Ange ett ordernummer.");
      return;
    }

    if (cart.length === 0) {
      setMessage("⚠️ Lägg till minst en artikel.");
      return;
    }

    // Convert cart into individual rows (1 row per item quantity)
    const upsellRows = [];
    cart.forEach((cartItem) => {
      for (let i = 0; i < cartItem.qty; i++) {
        upsellRows.push({
          employee_name: employeeName,
          item: cartItem.name,
          order_number: orderNumber.trim(),
        });
      }
    });

    const { error } = await supabase.from("upsells").insert(upsellRows);

    if (error) {
      console.error(error);
      setMessage("❌ Fel vid registrering.");
      return;
    }

    // Reset after success
    setMessage("✔ Registrerat!");
    setOrderNumber("");
    setCart([]);
  }

  // -------------------------------------------------------
  // LOAD CLOCKED-IN EMPLOYEES
  // -------------------------------------------------------
  async function loadClockedInEmployees() {
    const { data, error } = await supabase
      .from("employees_clocked")
      .select("name, clocked_in")
      .eq("clocked_in", true);

    if (!error) setClockedInEmployees(data || []);
  }

  // -------------------------------------------------------
  // LOAD TODAY'S LEADERBOARD (ONLY CLOCKED-IN)
  // -------------------------------------------------------
  async function loadLeaderboard() {
    setLoadingLeaderboard(true);

    // Step 1: get active employees
    const { data: active, error: activeError } = await supabase
      .from("employees_clocked")
      .select("name, clocked_in")
      .eq("clocked_in", true);

    if (activeError) {
      console.error(activeError);
      setLoadingLeaderboard(false);
      return;
    }

    const activeNames = active?.map((e) => e.name) || [];

    // Step 2: get today's upsells
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: upsells, error: upsellError } = await supabase
      .from("upsells")
      .select("*")
      .gte("created_at", startOfDay.toISOString());

    if (upsellError) {
      console.error(upsellError);
      setLoadingLeaderboard(false);
      return;
    }

    // Step 3: build leaderboard map
    const lbMap = {};

    activeNames.forEach((name) => {
      lbMap[name] = {
        name,
        total: 0,
        APPLE_PIE: 0,
        PLUS_MENU: 0,
        DIPSAUCE: 0,
        COFFEE: 0,
      };
    });

    (upsells || []).forEach((u) => {
      if (!lbMap[u.employee_name]) return;

      lbMap[u.employee_name].total++;

      if (u.item === "Äpple paj") lbMap[u.employee_name].APPLE_PIE++;
      if (u.item === "Plusmeny") lbMap[u.employee_name].PLUS_MENU++;
      if (u.item === "Dipsås") lbMap[u.employee_name].DIPSAUCE++;
      if (u.item === "Kaffe") lbMap[u.employee_name].COFFEE++;
    });

    const sorted = Object.values(lbMap).sort((a, b) => b.total - a.total);
    setLeaderboard(sorted);
    setLoadingLeaderboard(false);
  }

  // -------------------------------------------------------
  // REALTIME SUBSCRIPTIONS
  // -------------------------------------------------------
  useEffect(() => {
    loadLeaderboard();
    loadClockedInEmployees();

    const channel = supabase
      .channel("employee_realtime")
      .on("postgres_changes", { table: "upsells", event: "*" }, loadLeaderboard)
      .on(
        "postgres_changes",
        { table: "employees_clocked", event: "*" },
        () => {
          loadClockedInEmployees();
          loadLeaderboard();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // -------------------------------------------------------
  // CLOCK OUT
  // -------------------------------------------------------
  async function handleClockOut() {
    await supabase
      .from("employees_clocked")
      .update({ clocked_in: false })
      .eq("name", employeeName);

    localStorage.removeItem("employeeName");
    window.location.href = "/login";
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div className="employee-page">
      {/* ---------------- TOP BAR ---------------- */}
      <div className="topbar">
        <span className="mclogo">🍔</span>

        <div className="user-box">
          <span>Inloggad:</span>
          <strong>{employeeName}</strong>
          <button className="logout-btn" onClick={handleClockOut}>
            Stämpla ut
          </button>
        </div>
      </div>

      <div className="content">
        {/* ---------------- LEFT PANEL ---------------- */}
        <div className="left-panel">
          {/* ITEM GRID */}
          <div className="item-grid">
            {ITEMS.map((item) => (
              <div
                key={item.id}
                className="item-card"
                onClick={() => addItemToCart(item)}
              >
                <div className="item-icon">{item.icon}</div>
                <p className="item-name">{item.name}</p>
              </div>
            ))}
          </div>

          {/* CART PANEL */}
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
                        onClick={() => updateCartItemQuantity(item, -1)}
                      >
                        -
                      </button>
                      <span className="qty-value">{item.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateCartItemQuantity(item, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ORDER FORM */}
            {/* ORDER FORM */}
            <form className="order-form" onSubmit={submitUpsells}>
              <input
                type="text"
                className="order-input"
                placeholder="Ordernummer (2 siffror)"
                value={orderNumber}
                onChange={(e) => {
                  let value = e.target.value;

                  // Allow only numbers
                  value = value.replace(/\D/g, "");

                  // Max 2 digits
                  if (value.length > 2) value = value.slice(0, 2);

                  setOrderNumber(value);
                }}
              />

              <button
                className="submit-btn"
                disabled={cart.length === 0 || !/^\d{2}$/.test(orderNumber)}
              >
                Registrera upsells
              </button>

              {/* Error message */}
              {message && <p className="msg">{message}</p>}
            </form>

          </div>
        </div>

        {/* ---------------- RIGHT PANEL ---------------- */}
        <div className="cart-panel">
          <h4 className="cart-title">Leaderboard (idag)</h4>

          {loadingLeaderboard ? (
            <p>Laddar...</p>
          ) : leaderboard.length === 0 ? (
            <p className="cart-empty">Inga uppsälj ännu.</p>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Medarbetare</th>
                  <th>Totalt</th>
                  <th>Äpple</th>
                  <th>Plus</th>
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
      </div>
    </div>
  );
}
