import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/Login.css";

export default function Login() {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  async function handleClockIn(e) {
    e.preventDefault();
    setMsg("");

    const trimmed = name.trim();
    if (!trimmed) {
      return setMsg("⚠️ Skriv ditt namn för att stämpla in.");
    }

    // Store name locally for the employee page
    localStorage.setItem("employeeName", trimmed);
    // Clear old user object if it exists
    localStorage.removeItem("user");

    // Mark as clocked in (upsert by name – name is UNIQUE in DB)
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

  return (
    <div className="login-wrapper">
      <div className="login-left">
        <div>
          <h1 className="login-brand">🍟 McUpsell</h1>
          <p className="login-subtext">
            Snabb uppföljning av upsells — utan krångel.
          </p>
        </div>
      </div>

      <div className="login-box">
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

{/* MANAGER BUTTON */}
<div style={{ marginTop: "1.5rem", textAlign: "center" }}>
  <button
    type="button"
    onClick={() => navigate("/manager")}
    style={{
      background: "#ffffff",
      border: "2px solid #f22c00",
      color: "#f22c00",
      padding: "0.8rem 1.4rem",
      borderRadius: "14px",
      fontWeight: "700",
      cursor: "pointer",
      fontSize: "1rem",
    }}
  >
    👨‍💼 Manager Panel
  </button>
</div>

      </div>
    </div>
  );
}
