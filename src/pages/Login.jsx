import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Login.css";

/**
 * Login Page
 * ---------------------------------------------
 * - Handles employee clock-in logic
 * - Handles manager login with password check (Supabase table)
 * - UI kept clean, simple, and fully CSS-based
 */

export default function Login() {
  // Employee login state
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  // Manager login state
  const [showManagerField, setShowManagerField] = useState(false);
  const [managerPassword, setManagerPassword] = useState("");
  const [managerError, setManagerError] = useState("");

  const navigate = useNavigate();

  /* ============================================================
     EMPLOYEE CLOCK-IN
  ============================================================ */
  async function handleClockIn(e) {
    e.preventDefault();
    setMsg("");

    const trimmed = name.trim();
    if (!trimmed) {
      return setMsg("⚠️ Skriv ditt namn för att stämpla in.");
    }

    // Save logged-in employee name
    localStorage.setItem("employeeName", trimmed);
    localStorage.removeItem("user");

    // Mark user as clocked in (upsert by name)
    const { error } = await supabase.from("employees_clocked").upsert(
      {
        name: trimmed,
        clocked_in: true,
      },
      { onConflict: "name" }
    );

    if (error) {
      console.error(error);
      return setMsg("❌ Kunde inte stämpla in.");
    }

    navigate("/employee");
  }

  /* ============================================================
     MANAGER LOGIN
     - Fetch password from Supabase table
     - Compare with user input
     - Show error if wrong
  ============================================================ */
  async function handleManagerLogin() {
    setManagerError("");

    const { data, error } = await supabase
      .from("manager_access")
      .select("password")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Could not fetch manager password:", error);
      return;
    }

    if (data && managerPassword === data.password) {
      navigate("/manager");
      return;
    }

    // Wrong password → show error
    setManagerError("❌ Fel lösenord.");
  }

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="login-wrapper">
      {/* LEFT SECTION */}
      <div className="login-left">
        <div>
          <h1 className="login-brand">🍟 McUpsell</h1>
        </div>
      </div>

      {/* RIGHT SECTION */}
      <div className="login-box">
        {/* EMPLOYEE LOGIN */}
        <form className="login-form" onSubmit={handleClockIn}>
          <input
            className="login-input"
            placeholder="Skriv ditt namn"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <button className="login-button">Stämpla in & börja sälja</button>

          {msg && <p className="login-message">{msg}</p>}
        </form>

        {/* MANAGER LOGIN */}
        <div className="manager-section">
          {!showManagerField ? (
            <button
              type="button"
              className="manager-btn"
              onClick={() => setShowManagerField(true)}
            >
              👨‍💼 Manager Panel
            </button>
          ) : (
            <div className="manager-login-box">
              <input
                type="password"
                className="manager-input"
                placeholder="Managerlösenord"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
              />

              <button className="manager-login-btn" onClick={handleManagerLogin}>
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
