import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../../session";
import { TabBar } from "../patient/Shell";

export function CoachShell() {
  const { me, unread } = useSession();
  const links = [
    { to: "/", label: "Overview", icon: "home" },
    { to: "/inbox", label: "Inbox", icon: "inbox", badge: unread },
    { to: "/clients", label: "Clients", icon: "users" },
    { to: "/library", label: "Workouts", icon: "library" },
    { to: "/exercises", label: "Exercises", icon: "dumbbell" },
    { to: "/courses", label: "Store", icon: "store" },
    { to: "/account", label: "Account", icon: "account" },
  ];
  return (
    <div className="coach-shell">
      <header className="ledger-bar">
        <span className="wordmark">RehabLoop</span>
        <span className="grow" />
        <NavLink to="/account" className="ledger-account" title="Account">
          <span className="avatar">{me.name[0]}</span>
          <span className="hide-narrow">{me.name}</span>
        </NavLink>
      </header>
      <main className="coach-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
      <nav className="sheet-tabs" aria-label="Main">
        {links.filter((l) => l.to !== "/account").map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            {l.label}
            {!!l.badge && <span className="sheet-badge">{l.badge}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="coach-tabbar">
        <TabBar tabs={links.filter((l) => l.to !== "/account")} />
      </div>
    </div>
  );
}
