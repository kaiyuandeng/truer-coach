import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useSession } from "../../session";
import { TabBar } from "../patient/Shell";

export function CoachShell() {
  const { me, unread } = useSession();
  const links = [
    { to: "/", label: "Inbox", icon: "inbox", badge: unread },
    { to: "/clients", label: "Clients", icon: "users" },
    { to: "/library", label: "Workouts", icon: "library" },
    { to: "/exercises", label: "Exercises", icon: "dumbbell" },
    { to: "/account", label: "Account", icon: "account" },
  ];
  return (
    <div className="coach-shell">
      <nav className="sidenav" aria-label="Main">
        <div className="brand-mark">Rehab<span>Loop</span></div>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon name={l.icon} /> <span className="grow">{l.label}</span>
            {!!l.badge && <span className="chip danger" style={{ padding: "0 7px" }}>{l.badge}</span>}
          </NavLink>
        ))}
        <div style={{ marginTop: "auto" }} className="small faint">Signed in as {me.name}</div>
      </nav>
      <main className="coach-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
      <div className="coach-tabbar">
        <TabBar tabs={links.filter((l) => l.to !== "/account")} />
      </div>
    </div>
  );
}
