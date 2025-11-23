import { Link } from "react-router-dom";
import "./styles/AppLayout.css";

export default function App() {
  return (
    <div className="home-wrapper">
      <div className="home-card">
        <h1 className="home-title">🍟 McUpsell</h1>

        <Link to="/login">
          <button className="home-btn">Login</button>
        </Link>
      </div>
    </div>
  );
}
