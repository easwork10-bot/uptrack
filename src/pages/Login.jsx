import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Login.css";

export default function Login() {
  const [employeeName, setEmployeeName] = useState("");
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");

  const [showManager, setShowManager] = useState(false);
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [managerError, setManagerError] = useState("");

  const navigate = useNavigate();

  /* ---------------- Load restaurants ---------------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants_2")
        .select("id, name");

      setRestaurants(data || []);
      if (data?.length === 1) setSelectedRestaurant(data[0].id);
    })();
  }, []);

  /* ---------------- Employee login ---------------- */
  async function handleClockIn(e) {
    e.preventDefault();
    setEmployeeMessage("");

    const name = employeeName.trim();
    if (!name) return setEmployeeMessage("⚠️ Skriv ditt namn.");
    if (!selectedRestaurant) return setEmployeeMessage("⚠️ Välj restaurang.");

    let employeeId;

    // Check if exists
    const { data: existing } = await supabase
      .from("employees_2")
      .select("id")
      .eq("name", name)
      .eq("restaurant_id", selectedRestaurant)
      .maybeSingle();

    if (existing) {
      employeeId = existing.id;
      await supabase
        .from("employees_2")
        .update({
          clocked_in: true,
          clocked_at: new Date().toISOString(),
        })
        .eq("id", employeeId);
    } else {
      const { data: created } = await supabase
        .from("employees_2")
        .insert({
          name,
          restaurant_id: selectedRestaurant,
          clocked_in: true,
          clocked_at: new Date().toISOString(),
        })
        .select()
        .single();

      employeeId = created.id;
    }

    // Save session PER TAB
    sessionStorage.setItem("employeeName", name);
    sessionStorage.setItem("employeeId", employeeId);
    sessionStorage.setItem("restaurantId", selectedRestaurant);

    navigate("/employee");
  }

  /* ---------------- Manager login ---------------- */
  async function handleManagerLogin() {
    setManagerError("");

    const { data: manager, error } = await supabase
  .from("branch_managers_2")
  .select("id, username, password_hash")
  .eq("username", managerUsername.trim())
  .single();


    if (error || !manager) return setManagerError("❌ Fel användarnamn.");

    if (managerPassword !== manager.password_hash)
      return setManagerError("❌ Fel lösenord.");

    sessionStorage.setItem("manager_is_admin", "true");
    sessionStorage.setItem("manager_username", manager.username);


    navigate("/manager");
  }

  return (
    <div className="login-wrapper">
      <div className="login-left">
        <h1 className="login-brand">🍟 McUpsell</h1>
      </div>

      <div className="login-box">

        {/* EMPLOYEE FORM */}
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

        {/* MANAGER AREA */}
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
