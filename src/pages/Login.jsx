import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Login.css";

export default function Login() {
  /* ============================================================
     EMPLOYEE STATE
  ============================================================ */
  const [employeeName, setEmployeeName] = useState("");
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");

  /* ============================================================
     MANAGER STATE
  ============================================================ */
  const [showManager, setShowManager] = useState(false);
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [managerError, setManagerError] = useState("");

  const navigate = useNavigate();

  /* ============================================================
     LOAD RESTAURANTS (MCD ONLY)
  ============================================================ */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .order("id");

      if (error) {
        console.error("Restaurant load error:", error);
        return;
      }

      setRestaurants(data || []);
      if (data?.length === 1) setSelectedRestaurant(data[0].id);
    })();
  }, []);

  /* ============================================================
     EMPLOYEE CLOCK-IN
  ============================================================ */
  async function handleClockIn(e) {
    e.preventDefault();
    setEmployeeMessage("");

    const name = employeeName.trim();

    if (!name) {
      setEmployeeMessage("⚠️ Skriv ditt namn.");
      return;
    }

    if (!selectedRestaurant) {
      setEmployeeMessage("⚠️ Välj restaurang.");
      return;
    }

    let employeeId;

    // 1) Check if employee already exists at restaurant
    const { data: existing, error: findError } = await supabase
      .from("employees")
      .select("id")
      .eq("name", name)
      .eq("restaurant_id", selectedRestaurant)
      .maybeSingle();

    if (findError) {
      console.error("Employee lookup error:", findError);
      setEmployeeMessage("❌ Fel vid inloggning.");
      return;
    }

    if (existing) {
      employeeId = existing.id;

      // Create new shift record
      const { error: shiftError } = await supabase
        .from("employee_shifts")
        .insert({
          employee_id: employeeId,
          restaurant_id: selectedRestaurant,
          clock_in_at: new Date().toISOString(),
        });

      if (shiftError) {
        console.error("Shift creation error:", shiftError);
        setEmployeeMessage("❌ Kunde inte stämpla in.");
        return;
      }
    } else {
      // Create new employee
      const { data: created, error } = await supabase
        .from("employees")
        .insert({
          name,
          restaurant_id: selectedRestaurant,
        })
        .select()
        .single();

      if (error || !created) {
        console.error("Employee create error:", error);
        setEmployeeMessage("❌ Kunde inte skapa användare.");
        return;
      }

      employeeId = created.id;

      // Create shift for new employee
      const { error: shiftError } = await supabase
        .from("employee_shifts")
        .insert({
          employee_id: employeeId,
          restaurant_id: selectedRestaurant,
          clock_in_at: new Date().toISOString(),
        });

      if (shiftError) {
        console.error("Shift creation error:", shiftError);
        setEmployeeMessage("❌ Kunde inte stämpla in.");
        return;
      }
    }

    // Save session (PER TAB, EXACTLY LIKE OLD CODE)
    sessionStorage.setItem("employeeName", name);
    sessionStorage.setItem("employeeId", employeeId);
    sessionStorage.setItem("restaurantId", selectedRestaurant);

    navigate("/employee");
  }

  /* ============================================================
     MANAGER LOGIN
  ============================================================ */
  async function handleManagerLogin() {
    setManagerError("");

    if (!managerUsername || !managerPassword) {
      setManagerError("⚠️ Fyll i alla fält.");
      return;
    }

    const { data: manager, error } = await supabase
      .from("branch_managers")
      .select("id, username, password, restaurant_id")
      .eq("username", managerUsername.trim())
      .maybeSingle();

    if (error || !manager) {
      setManagerError("❌ Fel användarnamn.");
      return;
    }

    // Simple password check (as before)
    if (managerPassword !== manager.password) {
      setManagerError("❌ Fel lösenord.");
      return;
    }

    sessionStorage.setItem("manager_is_admin", "true");
    sessionStorage.setItem("manager_username", manager.username);
    sessionStorage.setItem("manager_restaurant_id", manager.restaurant_id);

    navigate("/manager");
  }

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="login-wrapper">
      <div className="login-left">
        <h1 className="login-brand">🍟 McUpsell</h1>
      </div>

      <div className="login-box">
        {/* ================= EMPLOYEE ================= */}
        <form className="login-form" onSubmit={handleClockIn}>
          <input
            className="login-input"
            placeholder="Ditt namn"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
          />

          <select
            className="login-input"
            value={selectedRestaurant}
            onChange={(e) => setSelectedRestaurant(Number(e.target.value))}
          >
            <option value="">Välj restaurang</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <button className="login-button">Stämpla in</button>

          {employeeMessage && (
            <p className="login-message">{employeeMessage}</p>
          )}
        </form>

        {/* ================= MANAGER ================= */}
        <div className="manager-section">
          {!showManager ? (
            <button
              className="manager-btn"
              onClick={() => setShowManager(true)}
            >
              👨‍💼 Manager Panel
            </button>
          ) : (
            <div className="manager-login-box">
              <input
                className="manager-input"
                placeholder="Användarnamn"
                value={managerUsername}
                onChange={(e) => setManagerUsername(e.target.value)}
              />

              <input
                type="password"
                className="manager-input"
                placeholder="Lösenord"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
              />

              <button
                className="manager-login-btn"
                onClick={handleManagerLogin}
              >
                Logga in
              </button>

              {managerError && (
                <p className="manager-error">{managerError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
